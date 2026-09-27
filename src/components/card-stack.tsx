import * as Haptics from 'expo-haptics';
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

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Direction a card was thrown. What each one *means* is the caller's business. */
export type StackDirection = 'right' | 'left' | 'down';

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

export type StackLabels = {
  right: string;
  left: string;
  /** Omit to disable the downward throw entirely. */
  down?: string;
};

export type CardStackProps<T> = {
  cards: T[];
  keyOf: (card: T) => string;
  renderCard: (card: T) => React.ReactNode;
  width: number;
  height: number;
  /** The word stamped on the card as you drag it each way. */
  labels: StackLabels;
  /**
   * Called once a card has animated away. The parent owns the queue: it must
   * remove the card in response, which is what advances the stack. Keeping the
   * index out of here means a background refetch can't silently rewind it.
   */
  onAction: (direction: StackDirection, card: T) => void;
  /** Rendered when the stack runs out of cards. */
  empty?: React.ReactNode;
};

/**
 * A three-deep, throwable card stack.
 *
 * The active card owns the drag state *and* renders the cards behind it, so the
 * whole stack can react to a drag without a shared value crossing a component
 * boundary it can't be written from. Keying by `keyOf` means a commit unmounts
 * the card and the next mounts centred, with no reset flicker.
 *
 * Deliberately knows nothing about what a card contains — the outfit builder
 * throws garments, the capsule suggester throws whole outfits.
 */
export function CardStack<T>({
  cards,
  keyOf,
  renderCard,
  width,
  height,
  labels,
  onAction,
  empty,
}: CardStackProps<T>) {
  const visible = cards.slice(0, 3);

  if (!visible.length) {
    return <View style={{ width, height, justifyContent: 'center' }}>{empty}</View>;
  }

  const [top, ...behind] = visible;

  return (
    <View style={{ width, height }}>
      <ActiveCard
        key={keyOf(top)}
        card={top}
        behind={behind}
        keyOf={keyOf}
        renderCard={renderCard}
        width={width}
        height={height}
        labels={labels}
        onCommit={onAction}
      />
    </View>
  );
}

function ActiveCard<T>({
  card,
  behind,
  keyOf,
  renderCard,
  width,
  height,
  labels,
  onCommit,
}: {
  card: T;
  behind: T[];
  keyOf: (card: T) => string;
  renderCard: (card: T) => React.ReactNode;
  width: number;
  height: number;
  labels: StackLabels;
  onCommit: (direction: StackDirection, card: T) => void;
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

  const downEnabled = !!labels.down;

  const fire = useCallback(
    (direction: StackDirection) => onCommit(direction, card),
    [card, onCommit]
  );

  /** Fired the instant a swipe is decided, not when it finishes animating. */
  const commitFeedback = useCallback((direction: StackDirection) => {
    Haptics.impactAsync(
      direction === 'right' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
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

      const vertical = downEnabled ? Math.max(0, event.translationY) : 0;
      const reach = Math.max(Math.abs(event.translationX), vertical);
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
      // Horizontal is resolved first: a fast diagonal flick satisfies both, and
      // the horizontal actions are the reversible ones.
      const down =
        downEnabled &&
        event.translationY > SWIPE_DISTANCE * 1.25 &&
        Math.abs(event.translationY) > Math.abs(event.translationX);

      if (right || left) {
        gone.value = true;
        const direction: StackDirection = right ? 'right' : 'left';
        const duration = exitDuration(event.velocityX);
        runOnJS(commitFeedback)(direction);

        progress.value = withTiming(1, { duration });
        // Carry a little of the throw's vertical momentum so the exit follows
        // the direction of the flick rather than leaving dead flat.
        y.value = withTiming(event.translationY + event.velocityY * 0.05, { duration });
        x.value = withTiming(
          (right ? 1 : -1) * width * EXIT_TRAVEL,
          { duration, easing: Easing.out(Easing.quad) },
          () => runOnJS(fire)(direction)
        );
        return;
      }

      if (down) {
        gone.value = true;
        const duration = exitDuration(event.velocityY);
        runOnJS(commitFeedback)('down');
        progress.value = withTiming(1, { duration });
        y.value = withTiming(height * 1.25, { duration, easing: Easing.out(Easing.quad) }, () =>
          runOnJS(fire)('down')
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
        rotate: `${interpolate(x.value, [-width * 0.55, 0, width * 0.55], [-13, 0, 13], 'clamp')}deg`,
      },
    ],
  }));

  return (
    <>
      {behind.map((stacked, index) => (
        <StackedCard
          key={keyOf(stacked)}
          width={width}
          height={height}
          depth={index + 1}
          progress={progress}>
          {renderCard(stacked)}
        </StackedCard>
      ))}
      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.top, cardStyle]}>
          {renderCard(card)}
          <Stamps x={x} y={y} labels={labels} />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

function StackedCard({
  width,
  height,
  depth,
  progress,
  children,
}: {
  width: number;
  height: number;
  depth: number;
  /** Read-only here — only the active card writes it. */
  progress: SharedValue<number>;
  children: React.ReactNode;
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
      style={[StyleSheet.absoluteFill, { width, height, zIndex: 3 - depth }, style]}
      pointerEvents="none">
      {children}
    </Animated.View>
  );
}

function Stamps({
  x,
  y,
  labels,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  labels: StackLabels;
}) {
  const theme = useTheme();

  // Fade in over the first third of the travel and settle to full size exactly
  // at the threshold, so the card reads its own verdict back before you let go.
  const right = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [8, SWIPE_DISTANCE * 0.55], [0, 1], 'clamp'),
    transform: [
      { rotate: '-12deg' },
      { scale: interpolate(x.value, [8, SWIPE_DISTANCE], [0.8, 1], 'clamp') },
    ],
  }));
  const left = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE_DISTANCE * 0.55, -8], [1, 0], 'clamp'),
    transform: [
      { rotate: '12deg' },
      { scale: interpolate(x.value, [-SWIPE_DISTANCE, -8], [1, 0.8], 'clamp') },
    ],
  }));
  const down = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [20, SWIPE_DISTANCE * 0.8], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(y.value, [20, SWIPE_DISTANCE * 1.25], [0.8, 1], 'clamp') }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.stamp, styles.stampLeft, right, { borderColor: theme.positive }]}>
        <ThemedText style={[styles.stampText, { color: theme.positive }]}>{labels.right}</ThemedText>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampRight, left, { borderColor: '#FFFFFF' }]}>
        <ThemedText style={[styles.stampText, { color: '#FFFFFF' }]}>{labels.left}</ThemedText>
      </Animated.View>
      {labels.down ? (
        <Animated.View style={[styles.stamp, styles.stampBottom, down, { borderColor: theme.negative }]}>
          <ThemedText style={[styles.stampText, { color: theme.negative }]}>{labels.down}</ThemedText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { zIndex: 3 },
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
