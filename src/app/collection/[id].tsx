import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { SuggestionDeck, type SuggestionAction } from '@/components/suggestion-deck';
import { OutfitCard, type OutfitCardAction } from '@/components/outfit-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import {
  addOutfitsToCapsule,
  capsuleItems,
  clearDismissed,
  deleteCapsule,
  dismissedSuggestions,
  dismissSuggestion,
  packedItems,
  removeOutfitFromCapsule,
  renameCapsule,
  resetPacked,
  setPacked,
} from '@/db/capsules';
import { listItems } from '@/db/items';
import { suggestOutfits, type Suggestion } from '@/lib/suggest';
import { collectionOutfits, getCollection } from '@/db/collections';
import {
  archiveOutfits,
  clearableCount,
  createOutfit,
  restoreOutfit,
  setFavorite,
} from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import {
  COLLECTION_EMPTY_BODY,
  COLLECTION_SYMBOL,
  collectionKind,
} from '@/lib/collections';
import { CATEGORY_LABEL, type Category } from '@/lib/taxonomy';
import type { Collection, Item, Outfit } from '@/lib/types';

/** Packing list grouped the way you'd actually lay things out. */
function groupForPacking(items: Item[]): { category: Category; items: Item[] }[] {
  const order: Category[] = ['onepiece', 'top', 'bottom', 'outerwear', 'shoes', 'accessory'];
  return order
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((group) => group.items.length > 0);
}

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();

  const kind = collectionKind(id);
  const { width: screenWidth } = useWindowDimensions();
  const suggestionWidth = Math.min(screenWidth - Spacing.four * 2, 460);
  const suggestionHeight = Math.round(suggestionWidth * 0.62);
  const isCapsule = kind === 'capsule';

  const [view, setView] = useState<'outfits' | 'packing'>('outfits');

  const { data: collection, loading } = useQuery(
    (d) => getCollection(d, id),
    null as Collection | null,
    [id]
  );
  const { data: outfits } = useQuery((d) => collectionOutfits(d, id), [] as Outfit[], [id]);
  const { data: items } = useQuery(
    (d) => (isCapsule ? capsuleItems(d, id) : Promise.resolve([])),
    [] as Item[],
    [id, isCapsule]
  );
  const { data: packedIds } = useQuery(
    (d) => (isCapsule ? packedItems(d, id) : Promise.resolve([])),
    [] as string[],
    [id, isCapsule]
  );
  const { data: wardrobe } = useQuery(
    (d) => (isCapsule ? listItems(d, { bench: 'active' }) : Promise.resolve([])),
    [] as Item[],
    [id, isCapsule]
  );
  const { data: dismissed } = useQuery(
    (d) => (isCapsule ? dismissedSuggestions(d, id) : Promise.resolve([])),
    [] as string[],
    [id, isCapsule]
  );

  const suggestions = useMemo(
    () =>
      isCapsule && wardrobe.length
        ? suggestOutfits({ wardrobe, existing: outfits, dismissed, count: 3 })
        : [],
    [isCapsule, wardrobe, outfits, dismissed]
  );

  if (loading || !collection) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  const packed = new Set(packedIds);
  const packedCount = items.filter((item) => packed.has(item.id)).length;
  const allPacked = items.length > 0 && packedCount === items.length;
  const packing = groupForPacking(items);

  async function onSuggestion(action: SuggestionAction, suggestion: Suggestion) {
    if (action === 'dismiss') {
      await dismissSuggestion(db, id, suggestion.id);
      return;
    }
    const outfitId = await createOutfit(
      db,
      suggestion.entries.map((e) => ({ slot: e.slot, itemId: e.item.id }))
    );
    await addOutfitsToCapsule(db, id, [outfitId]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function togglePacked(item: Item) {
    Haptics.selectionAsync();
    setPacked(db, id, item.id, !packed.has(item.id));
  }

  function promptRename() {
    if (!collection) return;
    Alert.prompt(
      'Rename capsule',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (name?: string) => {
            if (name?.trim()) renameCapsule(db, id, name);
          },
        },
      ],
      'plain-text',
      collection.name
    );
  }

  function confirmDeleteCapsule() {
    if (!collection) return;
    Alert.alert(
      `Delete "${collection.name}"?`,
      'The outfits and pieces in it stay exactly where they are — only the grouping goes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCapsule(db, id);
            router.back();
          },
        },
      ]
    );
  }

  async function confirmClear() {
    const clearable = await clearableCount(db);
    if (!clearable) {
      Alert.alert('Nothing to clear', 'What is left is either favorited or filed into a capsule.');
      return;
    }
    Alert.alert(
      `Clear ${clearable} ${clearable === 1 ? 'outfit' : 'outfits'}?`,
      'They move to Archived — nothing is deleted. Favorites and anything in a capsule are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', onPress: () => archiveOutfits(db, { keepFavorites: true }) },
      ]
    );
  }

  /**
   * The trailing control on each card says what this collection can do to the
   * outfit: heart it, un-heart it out of Favorites, restore it from Archived,
   * or drop it from a capsule.
   */
  function cardAction(outfit: Outfit): OutfitCardAction {
    if (kind === 'archived') {
      return {
        icon: 'arrow.uturn.backward.circle',
        label: 'Move back to current',
        onPress: () => {
          restoreOutfit(db, outfit.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      };
    }

    if (isCapsule) {
      return {
        icon: 'minus.circle',
        label: 'Remove from capsule',
        onPress: () =>
          Alert.alert('Remove from capsule?', 'The outfit itself is kept.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', onPress: () => removeOutfitFromCapsule(db, id, outfit.id) },
          ]),
      };
    }

    return {
      icon: outfit.favorite ? 'heart.fill' : 'heart',
      label: outfit.favorite ? 'Remove from favorites' : 'Add to favorites',
      active: outfit.favorite,
      onPress: () => setFavorite(db, outfit.id, !outfit.favorite),
    };
  }

  const subtitle = isCapsule
    ? `${collection.outfitCount} ${collection.outfitCount === 1 ? 'OUTFIT' : 'OUTFITS'}${
        collection.itemCount > 0 ? ` · ${collection.itemCount} PIECES` : ''
      }`
    : `${collection.outfitCount} ${collection.outfitCount === 1 ? 'OUTFIT' : 'OUTFITS'}`;

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            isCapsule ? (
              <Pressable onPress={promptRename} accessibilityRole="button" hitSlop={12}>
                <ThemedText style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
                  Rename
                </ThemedText>
              </Pressable>
            ) : kind === 'all' && outfits.length ? (
              <Pressable onPress={confirmClear} accessibilityRole="button" hitSlop={12}>
                <ThemedText style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
                  Clear
                </ThemedText>
              </Pressable>
            ) : null,
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>{subtitle}</ThemedText>
          <ThemedText style={styles.title}>{collection.name}</ThemedText>
        </View>

        {isCapsule ? (
          <Button
            label="Add outfits"
            icon="plus"
            fullWidth
            onPress={() => router.push(`/collection/${id}/add`)}
          />
        ) : null}

        {isCapsule && outfits.length ? (
          <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
            {(['outfits', 'packing'] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setView(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: view === value }}
                style={[styles.segmentItem, view === value && { backgroundColor: theme.surface }]}>
                <ThemedText
                  type="small"
                  style={{
                    fontWeight: '600',
                    color: view === value ? theme.text : theme.textSecondary,
                  }}>
                  {value === 'outfits' ? 'Outfits' : 'Packing list'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isCapsule && view === 'outfits' && suggestions.length ? (
          <View style={{ gap: Spacing.three }}>
            <View style={styles.progressRow}>
              <ThemedText style={[styles.groupLabel, { color: theme.textTertiary }]}>
                SUGGESTED
              </ThemedText>
              {dismissed.length ? (
                <Pressable onPress={() => clearDismissed(db, id)} hitSlop={10} accessibilityRole="button">
                  <ThemedText type="small" style={{ color: theme.accent, fontWeight: '600' }}>
                    Bring back {dismissed.length}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            <View style={{ height: suggestionHeight }}>
              <SuggestionDeck
                suggestions={suggestions}
                width={suggestionWidth}
                height={suggestionHeight}
                onAction={onSuggestion}
              />
            </View>

            <View style={styles.hintRow}>
              <View style={styles.hint}>
                <Icon name="arrow.left" size={12} color={theme.textTertiary} />
                <ThemedText type="small" themeColor="textTertiary" style={{ fontSize: 12 }}>
                  Nope
                </ThemedText>
              </View>
              <View style={styles.hint}>
                <Icon name="arrow.right" size={12} color={theme.textTertiary} />
                <ThemedText type="small" themeColor="textTertiary" style={{ fontSize: 12 }}>
                  Add to capsule
                </ThemedText>
              </View>
            </View>
          </View>
        ) : null}

        {!outfits.length ? (
          <EmptyState
            icon={COLLECTION_SYMBOL[kind]}
            title={isCapsule ? 'Nothing in here yet' : 'Nothing here yet'}
            body={
              isCapsule
                ? 'Add the outfits you want for this trip or occasion, and the pieces to pack are worked out for you.'
                : COLLECTION_EMPTY_BODY[kind]
            }
            actionLabel={kind === 'all' ? 'Start building' : undefined}
            onAction={kind === 'all' ? () => router.push('/build') : undefined}
          />
        ) : view === 'outfits' || !isCapsule ? (
          <View style={{ gap: Spacing.three }}>
            {outfits.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                onPress={() => router.push(`/outfit/${outfit.id}`)}
                action={cardAction(outfit)}
              />
            ))}
          </View>
        ) : (
          <View style={{ gap: Spacing.five }}>
            <View style={styles.progressRow}>
              <ThemedText
                style={[styles.groupLabel, { color: allPacked ? theme.accent : theme.textTertiary }]}>
                {allPacked ? 'ALL PACKED' : `${packedCount} OF ${items.length} PACKED`}
              </ThemedText>
              {packedCount > 0 ? (
                <Pressable onPress={() => resetPacked(db, id)} hitSlop={10} accessibilityRole="button">
                  <ThemedText type="small" style={{ color: theme.accent, fontWeight: '600' }}>
                    Reset
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {packing.map((group) => (
              <View key={group.category} style={{ gap: Spacing.three }}>
                <ThemedText style={[styles.groupLabel, { color: theme.textTertiary }]}>
                  {CATEGORY_LABEL[group.category]} · {group.items.length}
                </ThemedText>
                {group.items.map((item) => {
                  const isPacked = packed.has(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => togglePacked(item)}
                      onLongPress={() => router.push(`/item/${item.id}`)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isPacked }}
                      accessibilityLabel={item.name}
                      accessibilityHint="Long press to open the piece"
                      style={({ pressed }) => [
                        styles.packRow,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: isPacked ? theme.accent : theme.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}>
                      <Icon
                        name={isPacked ? 'checkmark.circle.fill' : 'circle'}
                        size={22}
                        color={isPacked ? theme.accent : theme.textTertiary}
                      />
                      <View style={[styles.packThumb, isPacked && styles.packedThumb]}>
                        <ItemImage item={item} radius={Radius.sm} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <ThemedText
                          numberOfLines={1}
                          style={[
                            { fontWeight: '600', fontSize: 16, lineHeight: 21 },
                            isPacked && {
                              color: theme.textTertiary,
                              textDecorationLine: 'line-through' as const,
                            },
                          ]}>
                          {item.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {[item.brand, item.subcategory].filter(Boolean).join(' · ')}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {isCapsule ? (
          <Button label="Delete capsule" variant="danger" fullWidth onPress={confirmDeleteCapsule} />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.eight },
  title: Type.display,
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  groupLabel: { ...Type.label, textTransform: 'uppercase' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: Radius.pill, gap: 4 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hintRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.five },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  packThumb: { width: 52, height: 66, borderRadius: Radius.sm, overflow: 'hidden' },
  packedThumb: { opacity: 0.4 },
});
