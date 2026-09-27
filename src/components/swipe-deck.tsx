import { StyleSheet, View } from 'react-native';

import { CardStack, type StackDirection } from '@/components/card-stack';
import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scoreLabel, type RankedItem } from '@/lib/pairing';
import { CATEGORY_LABEL, colorHex } from '@/lib/taxonomy';
import { LinearGradient } from 'expo-linear-gradient';

export type SwipeAction = 'pick' | 'pass' | 'bench';

const ACTION: Record<StackDirection, SwipeAction> = {
  right: 'pick',
  left: 'pass',
  down: 'bench',
};

export type SwipeDeckProps = {
  cards: RankedItem[];
  width: number;
  height: number;
  onAction: (action: SwipeAction, card: RankedItem) => void;
  /**
   * Whether to show the match verdict. False for the first pick of an outfit —
   * there is nothing to match against yet, so a score would be noise.
   */
  showMatch?: boolean;
  /** Rendered when the deck runs out of cards. */
  empty?: React.ReactNode;
};

/** The outfit builder's deck: one garment per card, thrown to pick or bench. */
export function SwipeDeck({
  cards,
  width,
  height,
  onAction,
  showMatch = true,
  empty,
}: SwipeDeckProps) {
  return (
    <CardStack
      cards={cards}
      keyOf={(card) => card.item.id}
      renderCard={(card) => (
        <Card card={card} width={width} height={height} showMatch={showMatch} />
      )}
      width={width}
      height={height}
      labels={{ right: 'Pick', left: 'Pass', down: 'Bench' }}
      onAction={(direction, card) => onAction(ACTION[direction], card)}
      empty={empty}
    />
  );
}

function Card({
  card,
  width,
  height,
  showMatch,
}: {
  card: RankedItem;
  width: number;
  height: number;
  showMatch: boolean;
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});
