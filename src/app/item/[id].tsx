import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ItemForm, type ItemDraft } from '@/components/item-form';
import { OutfitCard } from '@/components/outfit-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { allTags, benchItem, deleteItem, getItem, unbenchItem, updateItem } from '@/db/items';
import { outfitsForItem } from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { deleteImage } from '@/lib/photos';
import { CATEGORY_LABEL, FORMALITY_LABEL, colorHex } from '@/lib/taxonomy';
import { isBenched, type Item, type Outfit } from '@/lib/types';

const DAY = 864e5;

/** Scrim behind the floating header controls. */
const DISC_BG = 'rgba(0,0,0,0.55)';

function itemToDraft(item: Item): ItemDraft {
  return {
    name: item.name,
    brand: item.brand ?? '',
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    pattern: item.pattern,
    formality: item.formality,
    seasons: item.seasons,
    tags: item.tags,
    imageUri: item.imageUri,
    notes: item.notes ?? '',
  };
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();

  const { data: item, loading } = useQuery((d) => getItem(d, id), null as Item | null, [id]);
  const { data: tags } = useQuery((d) => allTags(d), []);
  const { data: wornIn } = useQuery((d) => outfitsForItem(d, id), [] as Outfit[], [id]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing(current: Item) {
    setDraft(itemToDraft(current));
    setEditing(true);
  }

  if (loading || !item) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  const benched = isBenched(item);

  async function save() {
    if (!draft || !item) return;
    setSaving(true);
    try {
      await updateItem(db, item.id, {
        name: draft.name.trim() || 'Untitled piece',
        brand: draft.brand.trim() || null,
        category: draft.category,
        subcategory: draft.subcategory,
        colors: draft.colors,
        pattern: draft.pattern,
        formality: draft.formality,
        seasons: draft.seasons,
        tags: draft.tags,
        imageUri: draft.imageUri,
        notes: draft.notes.trim() || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (error) {
      Alert.alert('Could not save', String((error as Error).message ?? error));
    } finally {
      setSaving(false);
    }
  }

  function promptBench() {
    if (!item) return;

    const choices: { label: string; until: number | null }[] = [
      { label: 'Until I bring it back', until: null },
      { label: 'For a week', until: Date.now() + 7 * DAY },
      { label: 'For a month', until: Date.now() + 30 * DAY },
      { label: 'For three months', until: Date.now() + 90 * DAY },
    ];

    const apply = (index: number) => {
      benchItem(db, item.id, choices[index].until);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Keep this out of outfits',
          options: ['Cancel', ...choices.map((c) => c.label)],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index > 0) apply(index - 1);
        }
      );
      return;
    }

    Alert.alert('Keep this out of outfits', undefined, [
      ...choices.map((c, i) => ({ text: c.label, onPress: () => apply(i) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert('Delete this piece?', `"${item.name}" will be removed from every outfit it's in.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          deleteImage(item.imageUri);
          await deleteItem(db, item.id);
          router.back();
        },
      },
    ]);
  }

  /**
   * Navigation options merge across renders, so a slot left unset in one mode
   * keeps whatever the other mode put there — which previously stranded a dead
   * "Cancel" over the back button after leaving edit mode. Both sides are
   * always specified, and `headerLeft` is a single component that reads the
   * current mode, so there is no stale closure either.
   */
  const headerOptions = {
    title: editing ? 'Edit' : '',
    headerBackVisible: false,
    // In view mode the header floats over the full-bleed hero, so its controls
    // get their own dark discs to stay legible against any photo.
    headerTransparent: !editing,
    headerStyle: editing ? { backgroundColor: theme.background } : { backgroundColor: 'transparent' },
    headerLeft: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editing ? 'Cancel editing' : 'Back'}
        hitSlop={12}
        onPress={() => (editing ? setEditing(false) : router.back())}
        style={editing ? styles.headerButton : [styles.headerDisc, { backgroundColor: DISC_BG }]}>
        {editing ? (
          <ThemedText style={{ color: theme.accent, fontSize: 16 }}>Cancel</ThemedText>
        ) : (
          <Icon name="chevron.left" size={18} color="#FFFFFF" weight="semibold" />
        )}
      </Pressable>
    ),
    headerRight: () =>
      editing ? null : (
        <Pressable
          onPress={() => startEditing(item)}
          accessibilityRole="button"
          accessibilityLabel="Edit"
          hitSlop={12}
          style={[styles.headerDisc, { backgroundColor: DISC_BG }]}>
          <Icon name="pencil" size={16} color="#FFFFFF" weight="semibold" />
        </Pressable>
      ),
  };

  if (editing && draft) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <ItemForm draft={draft} onChange={setDraft} imageKey={item.id} tagSuggestions={tags} />
          <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <Button label="Save changes" onPress={save} loading={saving} size="lg" fullWidth />
          </View>
        </View>
      </>
    );
  }

  const benchedUntilLabel =
    item.benchedUntil != null
      ? `Back on ${new Date(item.benchedUntil).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}`
      : 'Out until you bring it back';

  return (
    <>
      <Stack.Screen options={headerOptions} />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Full-bleed hero with the title sitting on it. */}
        <View style={styles.hero}>
          <ItemImage item={item} radius={0} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.97)']}
            locations={[0, 0.6, 1]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          <View style={styles.heroBody} pointerEvents="none">
            <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
              {(item.subcategory ?? CATEGORY_LABEL[item.category]).toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.name}>{item.name}</ThemedText>
            {item.brand ? (
              <ThemedText themeColor="textSecondary" style={{ fontSize: 15 }}>
                {item.brand}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionRow}>
          <Button
            label="Start an outfit"
            icon="wand.and.stars"
            onPress={() =>
              router.navigate({
                pathname: '/build',
                // Nonce so starting from the same piece twice still seeds.
                params: { start: `${item.id}:${Date.now()}` },
              })
            }
          />
          {benched ? (
            <Button
              label="Bring back"
              icon="arrow.uturn.backward"
              variant="secondary"
              onPress={() => unbenchItem(db, item.id)}
            />
          ) : (
            <Button label="Bench" icon="pause.circle" variant="secondary" onPress={promptBench} />
          )}
          <Button label="Edit" icon="pencil" variant="secondary" onPress={() => startEditing(item)} />
          <Button label="Delete" icon="trash" variant="danger" onPress={confirmDelete} />
        </ScrollView>

        <View style={styles.body}>
        {benched ? (
          <View style={[styles.notice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Icon name="pause.circle.fill" size={18} color={theme.textSecondary} />
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">Benched</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {benchedUntilLabel}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <View style={[styles.facts, { borderColor: theme.border }]}>
          <Fact first label="Formality" value={FORMALITY_LABEL[item.formality]} />
          <Fact label="Pattern" value={item.pattern[0].toUpperCase() + item.pattern.slice(1)} />
          <Fact label="Worn" value={item.wearCount === 0 ? 'Never' : `${item.wearCount}×`} />
        </View>

        {item.colors.length ? (
          <Group title="Colors">
            {item.colors.map((c) => (
              <Chip key={c} label={c} swatch={colorHex(c)} size="sm" />
            ))}
          </Group>
        ) : null}

        {item.seasons.length ? (
          <Group title="Seasons">
            {item.seasons.map((s) => (
              <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} size="sm" />
            ))}
          </Group>
        ) : null}

        {item.tags.length ? (
          <Group title="Tags">
            {item.tags.map((t) => (
              <Chip key={t} label={t} size="sm" />
            ))}
          </Group>
        ) : null}

        {wornIn.length ? (
          <View style={{ gap: Spacing.three }}>
            <ThemedText style={styles.factLabel} themeColor="textTertiary">
              In {wornIn.length} {wornIn.length === 1 ? 'outfit' : 'outfits'}
            </ThemedText>
            {wornIn.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                onPress={() => router.push(`/outfit/${outfit.id}`)}
              />
            ))}
          </View>
        ) : null}

        {item.notes ? (
          <Group title="Notes">
            <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 21 }}>
              {item.notes}
            </ThemedText>
          </Group>
        ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function Fact({ label, value, first }: { label: string; value: string; first?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.fact,
        !first && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.border },
      ]}>
      <ThemedText style={styles.factLabel} themeColor="textTertiary">
        {label}
      </ThemedText>
      <ThemedText style={Type.value} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText style={styles.factLabel} themeColor="textTertiary">
        {title}
      </ThemedText>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { flexDirection: 'row', alignItems: 'center', minWidth: 30 },
  headerDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The hero bleeds to the edges, so padding is applied per-section below it.
  content: { gap: Spacing.four, paddingBottom: Spacing.eight },
  hero: { aspectRatio: 4 / 5 },
  heroScrim: { ...StyleSheet.absoluteFill, top: '35%' },
  heroBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  actionRow: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  body: { paddingHorizontal: Spacing.four, gap: Spacing.five },
  name: Type.title,
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  facts: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
  },
  fact: { flex: 1, gap: Spacing.one, paddingHorizontal: Spacing.three },
  factLabel: { ...Type.label, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  footer: {
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    borderTopWidth: 0.5,
  },
});
