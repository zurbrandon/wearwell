import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scoreLabel, type RankedItem } from '@/lib/pairing';
import { CATEGORY_LABEL, colorHex } from '@/lib/taxonomy';

export type SwipeAction = 'pick' | 'pass' | 'bench';

/** Drag past this, or flick faster than the velocity, to commit. */
const SWIPE_DISTANCE = 88;
const SWIPE_VELOCITY = 450;
/** Snap-back: stiff and near-critically damped, so it returns without wobble. */
const SPRING = { damping: 22, stiffness: 340, mass: 0.5 };
/** How far a committed card travels, in multiples of the card width. */
const EXIT_TRAVEL = 1.5;

/**
 * A flicked card should leave at roughly the speed it was thrown, while a slow
 * deliberate drag still clears quickly. Clamped so neither extreme drags.
 */
function exitDuration(velocity: number): number {
  'worklet';
  return Math.max(120, Math.min(225, 90000 / Math.max(Math.abs(velocity), 400)));
}

export type SwipeDeckProps = {
  cards: RankedItem[];
  width: number;
  height: number;
  /**
   * Called once a card has animated away. The parent owns the queue: it must
   * remove the card (or change slot) in response, which is what advances the
   * deck. Keeping the index out of here means a background refetch can't
   * silently rewind the stack.
   */
  onAction: (action: SwipeAction, card: RankedItem) => void;
  /**
   * Whether to show the match verdict. False for the first pick of an outfit —
   * there is nothing to match against yet, so a score would be noise.
   */
  showMatch?: boolean;
  /** Rendered when the deck runs out of cards. */
  empty?: React.ReactNode;
};

/**
 * A three-deep card stack.
 *
 * The active card owns the drag state *and* renders the cards behind it, so
 * the whole stack can react to a drag without any shared value crossing a
 * component boundary it can't be written from. Keying it by item id means a
 * commit unmounts it and the next card mounts centred, with no reset flicker.
 */
export function SwipeDeck({
  cards,
  width,
  height,
  onAction,
  showMatch = true,
  empty,
}: SwipeDeckProps) {
  const visible = cards.slice(0, 3);

  if (!visible.length) {
    return <View style={{ width, height, justifyContent: 'center' }}>{empty}</View>;
  }

  const [top, ...behind] = visible;

  return (
    <View style={{ width, height }}>
      <ActiveCard
        key={top.item.id}
        card={top}
        behind={behind}
        width={width}
        height={height}
        showMatch={showMatch}
        onCommit={onAction}
      />
    </View>
  );
}

function ActiveCard({
  card,
  behind,
  width,
  height,
  showMatch,
  onCommit,
}: {
  card: RankedItem;
  behind: RankedItem[];
  width: number;
  height: number;
  showMatch: boolean;
  onCommit: (action: SwipeAction, card: RankedItem) => void;
}) {
  /**
   * How far this card has moved toward a decision, 0–1. The cards behind read
   * it so the stack rises *while* you drag — by the time a swipe commits, the
   * next card is already at full size, which makes the promotion invisible.
   */
  const progress = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const gone = useSharedValue(false);
  /** Whether the drag is currently past the commit threshold. */
  const armed = useSharedValue(false);

  const fire = useCallback(
    (action: SwipeAction) => onCommit(action, card),
    [card, onCommit]
  );

  /** Fired the instant a swipe is decided, not when it finishes animating. */
  const commitFeedback = useCallback((action: SwipeAction) => {
    Haptics.impactAsync(
      action === 'pick' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  /** A light tick as the drag crosses the point of no return. */
  const thresholdFeedback = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (gone.value) return;

      x.value = event.translationX;
      y.value = event.translationY;

      const reach = Math.max(Math.abs(event.translationX), Math.max(0, event.translationY));
      progress.value = Math.min(reach / SWIPE_DISTANCE, 1);

      const past = reach >= SWIPE_DISTANCE;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(thresholdFeedback)();
      }
    })
    .onEnd((event) => {
      if (gone.value) return;

      const right = event.translationX > SWIPE_DISTANCE || event.velocityX > SWIPE_VELOCITY;
      const left = event.translationX < -SWIPE_DISTANCE || event.velocityX < -SWIPE_VELOCITY;
      // Bench needs a clearly vertical drag, and horizontal is resolved first:
      // a fast diagonal flick satisfies both, and picking something by mistake
      // is one undo away while benching quietly pulls a piece out of rotation.
      const down =
        event.translationY > SWIPE_DISTANCE * 1.25 &&
        Math.abs(event.translationY) > Math.abs(event.translationX);

      if (right || left) {
        gone.value = true;
        const action: SwipeAction = right ? 'pick' : 'pass';
        const duration = exitDuration(event.velocityX);
        runOnJS(commitFeedback)(action);

        progress.value = withTiming(1, { duration });
        // Carry a little of the throw's vertical momentum so the exit follows
        // the direction of the flick rather than leaving dead flat.
        y.value = withTiming(event.translationY + event.velocityY * 0.05, { duration });
        x.value = withTiming(
          (right ? 1 : -1) * width * EXIT_TRAVEL,
          { duration, easing: Easing.out(Easing.quad) },
          () => runOnJS(fire)(action)
        );
        return;
      }

      if (down) {
        gone.value = true;
        const duration = exitDuration(event.velocityY);
        runOnJS(commitFeedback)('bench');
        progress.value = withTiming(1, { duration });
        y.value = withTiming(height * 1.25, { duration, easing: Easing.out(Easing.quad) }, () =>
          runOnJS(fire)('bench')
        );
        return;
      }

      armed.value = false;
      progress.value = withSpring(0, SPRING);
      x.value = withSpring(0, SPRING);
      y.value = withSpring(0, SPRING);
    });

  const cardStyle = useAnimatedStyle(() => ({
    // Rotate over a narrower span than the full width so the card responds
    // within the first few points of movement.
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      {
        rotate: `${interpolate(
          x.value,
          [-width * 0.55, 0, width * 0.55],
          [-13, 0, 13],
          'clamp'
        )}deg`,
      },
    ],
  }));

  return (
    <>
      {behind.map((stacked, index) => (
        <StackedCard
          key={stacked.item.id}
          card={stacked}
          width={width}
          height={height}
          depth={index + 1}
          showMatch={showMatch}
          progress={progress}
        />
      ))}
      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.top, cardStyle]}>
          <Card card={card} width={width} height={height} showMatch={showMatch} x={x} y={y} />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

function StackedCard({
  card,
  width,
  height,
  depth,
  showMatch,
  progress,
}: {
  card: RankedItem;
  width: number;
  height: number;
  depth: number;
  showMatch: boolean;
  /** Read-only here — only the active card writes it. */
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Clamped at zero so a card never overshoots past the top slot.
    const effective = Math.max(0, depth - progress.value);
    return {
      transform: [{ scale: 1 - effective * 0.05 }, { translateY: effective * 16 }],
      opacity: 1 - effective * 0.22,
    };
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { zIndex: 3 - depth }, style]}
      pointerEvents="none">
      <Card card={card} width={width} height={height} showMatch={showMatch} />
    </Animated.View>
  );
}

function Card({
  card,
  width,
  height,
  showMatch,
  x,
  y,
}: {
  card: RankedItem;
  width: number;
  height: number;
  showMatch: boolean;
  x?: SharedValue<number>;
  y?: SharedValue<number>;
}) {
  const theme = useTheme();
  const { item, pairing } = card;
  const notes = pairing.reasons.length ? pairing.reasons : pairing.cautions;

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}>
      <ItemImage item={item} radius={0} style={styles.image} />

      <LinearGradient
        colors={['rgba(10,8,6,0)', 'rgba(10,8,6,0.45)', 'rgba(10,8,6,0.82)']}
        locations={[0, 0.55, 1]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.cardBody} pointerEvents="none">
        <View style={styles.swatches}>
          {item.colors.map((c) => (
            <View key={c} style={[styles.swatch, { backgroundColor: colorHex(c) }]} />
          ))}
        </View>

        <ThemedText style={[styles.cardEyebrow, { color: theme.accent }]} numberOfLines={1}>
          {(item.subcategory ?? CATEGORY_LABEL[item.category]).toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </ThemedText>
        {item.brand ? (
          <ThemedText style={styles.cardMeta} numberOfLines={1}>
            {item.brand}
          </ThemedText>
        ) : null}

        <View style={[styles.reasonRow, !showMatch && styles.reasonRowHidden]}>
          {showMatch ? (
            <View style={styles.reasonPill}>
              <ThemedText style={styles.reasonText}>{scoreLabel(pairing.score)}</ThemedText>
            </View>
          ) : null}
          {(showMatch ? notes : []).slice(0, 2).map((note) => (
            <View key={note} style={[styles.reasonPill, styles.reasonPillGhost]}>
              <ThemedText style={styles.reasonText}>{note}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      {x && y ? <SwipeOverlays x={x} y={y} /> : null}
    </View>
  );
}

function SwipeOverlays({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) {
  const theme = useTheme();

  // Stamps fade in over the first third of the travel and settle to full size
  // exactly at the threshold, so the card reads its own verdict back to you
  // before you let go.
  const pick = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [8, SWIPE_DISTANCE * 0.55], [0, 1], 'clamp'),
    transform: [
      { rotate: '-12deg' },
      { scale: interpolate(x.value, [8, SWIPE_DISTANCE], [0.8, 1], 'clamp') },
    ],
  }));
  const pass = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE_DISTANCE * 0.55, -8], [1, 0], 'clamp'),
    transform: [
      { rotate: '12deg' },
      { scale: interpolate(x.value, [-SWIPE_DISTANCE, -8], [1, 0.8], 'clamp') },
    ],
  }));
  const bench = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [20, SWIPE_DISTANCE * 0.8], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(y.value, [20, SWIPE_DISTANCE * 1.25], [0.8, 1], 'clamp') }],
  }));

  return (
    <>
      <Animated.View style={[styles.stamp, styles.stampLeft, pick, { borderColor: theme.positive }]}>
        <ThemedText style={[styles.stampText, { color: theme.positive }]}>Pick</ThemedText>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampRight, pass, { borderColor: '#FFFFFF' }]}>
        <ThemedText style={[styles.stampText, { color: '#FFFFFF' }]}>Pass</ThemedText>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampBottom, bench, { borderColor: theme.negative }]}>
        <ThemedText style={[styles.stampText, { color: theme.negative }]}>Bench</ThemedText>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  top: { zIndex: 3 },
  image: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  scrim: { ...StyleSheet.absoluteFill, top: '35%' },
  cardBody: { padding: Spacing.four, gap: Spacing.one },
  swatches: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.one },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  cardEyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  cardTitle: { ...Type.cardTitle, color: '#FFFFFF' },
  cardMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  reasonRowHidden: { marginTop: 0 },
  reasonPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  reasonPillGhost: { backgroundColor: 'rgba(255,255,255,0.1)' },
  reasonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  stamp: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    backgroundColor: 'rgba(10,8,6,0.35)',
  },
  stampLeft: { top: Spacing.five, left: Spacing.four },
  stampRight: { top: Spacing.five, right: Spacing.four },
  stampBottom: { top: Spacing.five, alignSelf: 'center' },
  stampText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
