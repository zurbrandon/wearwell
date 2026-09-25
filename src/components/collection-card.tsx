import { Pressable, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { COLLECTION_SYMBOL } from '@/lib/collections';
import type { Collection } from '@/lib/types';

/** Four-up cover built from the collection's garments. */
function Cover({ preview, collection }: { preview: string[]; collection: Collection }) {
  const theme = useTheme();
  const tiles = preview.slice(0, 4);

  if (!tiles.length) {
    return (
      <View style={[styles.cover, styles.coverEmpty, { backgroundColor: theme.backgroundElement }]}>
        <Icon
          name={COLLECTION_SYMBOL[collection.kind]}
          size={22}
          color={collection.kind === 'favorites' ? theme.accent : theme.textTertiary}
        />
      </View>
    );
  }

  return (
    <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]}>
      {tiles.map((uri) => (
        <View key={uri} style={styles.coverTile}>
          <ItemImage item={{ imageUri: uri, category: 'top', colors: [] }} radius={0} />
        </View>
      ))}
    </View>
  );
}

export function CollectionCard({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { outfitCount, itemCount, kind } = collection;

  const meta =
    outfitCount === 0
      ? 'EMPTY'
      : `${outfitCount} ${outfitCount === 1 ? 'OUTFIT' : 'OUTFITS'}` +
        // The packing count only means something for a capsule you'd travel with.
        (kind === 'capsule' && itemCount > 0 ? ` · ${itemCount} TO PACK` : '');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${collection.name}, ${outfitCount} outfits`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Cover preview={collection.preview} collection={collection} />

      <View style={styles.body}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {collection.name}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: theme.textTertiary }]}>{meta}</ThemedText>
      </View>

      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.three,
    paddingRight: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cover: {
    width: 68,
    height: 68,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  coverTile: { width: '50%', height: '50%' },
  body: { flex: 1, gap: Spacing.one },
  name: { ...Type.cardTitle, fontSize: 19, lineHeight: 23 },
  meta: { ...Type.label, textTransform: 'uppercase' },
});
