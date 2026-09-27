import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { CardStack, type StackDirection } from '@/components/card-stack';
import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Suggestion } from '@/lib/suggest';

export type SuggestionAction = 'add' | 'dismiss';

const ACTION: Record<StackDirection, SuggestionAction> = {
  right: 'add',
  left: 'dismiss',
  down: 'dismiss',
};

/**
 * A compact version of the builder's deck that throws whole outfits rather
 * than single garments. Right adds it to the capsule, left throws it away for
 * good. There is deliberately no third direction — bench makes no sense for a
 * combination, only for a piece.
 */
export function SuggestionDeck({
  suggestions,
  width,
  height,
  onAction,
  empty,
}: {
  suggestions: Suggestion[];
  width: number;
  height: number;
  onAction: (action: SuggestionAction, suggestion: Suggestion) => void;
  empty?: React.ReactNode;
}) {
  return (
    <CardStack
      cards={suggestions}
      keyOf={(s) => s.id}
      renderCard={(s) => <SuggestionCard suggestion={s} width={width} height={height} />}
      width={width}
      height={height}
      labels={{ right: 'Add', left: 'Nope' }}
      onAction={(direction, suggestion) => onAction(ACTION[direction], suggestion)}
      empty={empty}
    />
  );
}

function SuggestionCard({
  suggestion,
  width,
  height,
}: {
  suggestion: Suggestion;
  width: number;
  height: number;
}) {
  const theme = useTheme();
  const { entries, reused, reasons } = suggestion;

  return (
    <View
      style={[
        styles.card,
        { width, height, backgroundColor: theme.surface, borderColor: theme.border },
      ]}>
      <View style={styles.tiles}>
        {entries.map(({ item }) => (
          <View key={item.id} style={styles.tile}>
            <ItemImage item={item} radius={0} />
            {reused.includes(item.id) ? (
              <View style={[styles.reuseBadge, { backgroundColor: theme.accent }]}>
                <Icon name="checkmark" size={10} color={theme.accentText} weight="bold" />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.5, 1]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.body} pointerEvents="none">
        <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
          {reused.length
            ? `REUSES ${reused.length} YOU'RE PACKING`
            : `${entries.length} PIECES`}
        </ThemedText>
        <ThemedText style={styles.title} numberOfLines={1}>
          {entries[0].item.name}
        </ThemedText>
        <ThemedText style={styles.meta} numberOfLines={1}>
          {entries
            .slice(1)
            .map((e) => e.item.name)
            .join(' · ')}
        </ThemedText>
        {reasons.length ? (
          <View style={styles.pills}>
            {reasons.map((reason) => (
              <View key={reason} style={styles.pill}>
                <ThemedText style={styles.pillText}>{reason}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tiles: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  tile: { flex: 1, height: '100%' },
  reuseBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { ...StyleSheet.absoluteFill, top: '30%' },
  body: { padding: Spacing.four, gap: 2 },
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
  meta: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pillText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, fontWeight: '600' },
});
