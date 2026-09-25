import { Pressable, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isBenched, type Item } from '@/lib/types';

export function ItemTile({
  item,
  width,
  onPress,
}: {
  item: Item;
  width: number;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const benched = isBenched(item);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.brand ? `, ${item.brand}` : ''}`}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.7 : 1, gap: Spacing.two }]}>
      <View style={[styles.frame, { backgroundColor: theme.backgroundElement }]}>
        <ItemImage item={item} radius={Radius.md} style={benched ? styles.dimmed : undefined} />
        {benched ? (
          <View style={[styles.badge, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <ThemedText style={styles.badgeText} themeColor="textSecondary">
              Benched
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 1 }}>
        <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600' }}>
          {item.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textTertiary" numberOfLines={1} style={{ fontSize: 12 }}>
          {item.brand || item.subcategory || ''}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  dimmed: { opacity: 0.35 },
  badge: {
    position: 'absolute',
    left: Spacing.two,
    top: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
});
