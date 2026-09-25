import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activeFilterCount, EMPTY_FILTERS, FilterSheet, type ClosetFilters } from '@/components/filter-sheet';
import { ItemTile } from '@/components/item-tile';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, TabBarHeight, Type } from '@/constants/theme';
import { allTags, listItems, type ItemFilter } from '@/db/items';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { seedSampleCloset } from '@/lib/seed';
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABEL, type Category } from '@/lib/taxonomy';

const GUTTER = Spacing.three;
const PADDING = Spacing.four;

export default function ClosetScreen() {
  const theme = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [filters, setFilters] = useState<ClosetFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filterCount = activeFilterCount(filters);

  const filter: ItemFilter = useMemo(
    () => ({
      search,
      categories: category ? [category] : undefined,
      bench: filters.includeBenched ? 'all' : 'active',
      colors: filters.colors,
      patterns: filters.patterns,
      formality: filters.formality,
      seasons: filters.seasons,
      tags: filters.tags,
    }),
    [search, category, filters]
  );

  const { data: items, loading } = useQuery((db) => listItems(db, filter), [], [
    search,
    category,
    filters,
  ]);
  const { data: tagOptions } = useQuery((db) => allTags(db), []);

  const columns = width >= 700 ? 4 : 3;
  const tileWidth = (width - PADDING * 2 - GUTTER * (columns - 1)) / columns;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={items}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: PADDING,
          paddingBottom: insets.bottom + TabBarHeight + Spacing.six,
          gap: GUTTER,
        }}
        columnWrapperStyle={columns > 1 ? { gap: GUTTER } : undefined}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + Spacing.two, gap: Spacing.four }}>
            <View style={styles.titleRow}>
              <View style={{ gap: Spacing.one }}>
                <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
                  {items.length} {items.length === 1 ? 'PIECE' : 'PIECES'}
                  {filterCount ? ' · FILTERED' : ''}
                </ThemedText>
                <ThemedText style={styles.title}>Closet</ThemedText>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Settings"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.push('/settings')}
                  style={({ pressed }) => [
                    styles.headerButton,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.75 : 1 },
                  ]}>
                  <Icon name="ellipsis" size={20} color={theme.text} weight="bold" />
                </Pressable>

                {/*
                  Plain Pressable rather than <Link asChild>: Link clones its
                  child and passes its own `style` through, which wiped these
                  styles and left a bare glyph with no button behind it.
                */}
                <Pressable
                  accessibilityLabel="Add an item"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.push('/item/new')}
                  style={({ pressed }) => [
                    styles.headerButton,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.75 : 1 },
                  ]}>
                  <Icon name="plus" size={22} color={theme.accentText} weight="bold" />
                </Pressable>
              </View>
            </View>

            <View style={styles.searchRow}>
              <View
                style={[
                  styles.searchBar,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <Icon name="magnifyingglass" size={16} color={theme.textTertiary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name, brand, tag"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.searchInput, { color: theme.text }]}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>

              <Pressable
                onPress={() => setSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  filterCount ? `Filters, ${filterCount} active` : 'Filters'
                }
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    backgroundColor: filterCount ? theme.accent : theme.backgroundElement,
                    borderColor: filterCount ? theme.accent : theme.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <Icon
                  name="line.3.horizontal.decrease"
                  size={17}
                  color={filterCount ? theme.accentText : theme.text}
                  weight="semibold"
                />
                {filterCount ? (
                  <ThemedText style={[styles.filterCount, { color: theme.accentText }]}>
                    {filterCount}
                  </ThemedText>
                ) : null}
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}>
              <Chip
                label="All"
                selected={category === null}
                onPress={() => setCategory(null)}
                size="sm"
              />
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={CATEGORY_LABEL[c]}
                  emoji={CATEGORY_EMOJI[c]}
                  selected={category === c}
                  onPress={() => setCategory(category === c ? null : c)}
                  size="sm"
                />
              ))}
            </ScrollView>

          </View>
        }
        ListEmptyComponent={
          loading ? null : search || category || filterCount ? (
            <EmptyState
              icon="magnifyingglass"
              title="No matches"
              body={
                filterCount
                  ? 'Nothing fits every filter. Loosen one, or reset them all.'
                  : 'Try a different search or clear the category filter.'
              }
              actionLabel={filterCount ? 'Reset filters' : undefined}
              onAction={filterCount ? () => setFilters(EMPTY_FILTERS) : undefined}
            />
          ) : (
            <View>
              <EmptyState
                icon="tshirt.fill"
                title="Your closet is empty"
                body="Add a few pieces — photograph what you own, or drop in the details by hand."
                actionLabel="Add your first piece"
                onAction={() => router.push('/item/new')}
              />
              {__DEV__ ? (
                <View style={{ alignItems: 'center' }}>
                  <Button
                    label="Load sample closet"
                    variant="ghost"
                    size="sm"
                    onPress={() => seedSampleCloset(db)}
                  />
                </View>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => (
          <ItemTile item={item} width={tileWidth} onPress={() => router.push(`/item/${item.id}`)} />
        )}
      />

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setSheetOpen(false)}
        tagOptions={tagOptions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: Type.display,
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterCount: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 16, height: '100%' },
  filterRow: { gap: Spacing.two, paddingRight: Spacing.four },
});
