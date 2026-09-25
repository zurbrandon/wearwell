import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Outfit } from '@/lib/types';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The trailing control differs by context — favouriting in the outfits list,
 * removing inside a capsule — so the card takes it as configuration rather than
 * hardcoding a heart.
 */
export type OutfitCardAction = {
  icon: SFSymbol;
  label: string;
  /** Tints the icon with the accent, e.g. a filled heart. */
  active?: boolean;
  onPress: () => void;
};

export function OutfitCard({
  outfit,
  onPress,
  action,
}: {
  outfit: Outfit;
  onPress?: () => void;
  action?: OutfitCardAction;
}) {
  const theme = useTheme();
  const title = outfit.name || `${outfit.entries.length}-piece look`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.thumbs}>
        {outfit.entries.map(({ item }) => (
          <View key={item.id} style={[styles.thumb, { borderColor: theme.border }]}>
            <ItemImage item={item} radius={Radius.sm - 2} />
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={{ flex: 1, gap: 1 }}>
          <ThemedText style={{ fontWeight: '600', fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textTertiary" style={{ fontSize: 12 }}>
            {formatDate(outfit.createdAt)}
            {outfit.wornCount > 0 ? ` · worn ${outfit.wornCount}×` : ''}
          </ThemedText>
        </View>

        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            <Icon
              name={action.icon}
              size={19}
              color={action.active ? theme.accent : theme.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  thumbs: { flexDirection: 'row', gap: Spacing.two },
  thumb: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 96,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
