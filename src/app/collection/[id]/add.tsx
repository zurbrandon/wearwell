import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { addOutfitsToCapsule, capsuleOutfits } from '@/db/capsules';
import { listOutfits } from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import type { Outfit } from '@/lib/types';

/**
 * Multi-select picker. Capsules are usually filled in a batch — "these seven
 * for New York" — so this is the primary way in, rather than adding one outfit
 * at a time from each outfit's own screen.
 */
export default function AddToCapsuleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Both queues are offered: an outfit you cleared last month is still fair
  // game for a trip you're planning now.
  const { data: outfits } = useQuery((d) => listOutfits(d, 'all'), [] as Outfit[]);
  const { data: already } = useQuery((d) => capsuleOutfits(d, id), [] as Outfit[], [id]);
  const alreadyIn = new Set(already.map((o) => o.id));

  const available = outfits.filter((outfit) => !alreadyIn.has(outfit.id));

  function toggle(outfitId: string) {
    Haptics.selectionAsync();
    setSelected((current) =>
      current.includes(outfitId)
        ? current.filter((v) => v !== outfitId)
        : [...current, outfitId]
    );
  }

  async function save() {
    setSaving(true);
    await addOutfitsToCapsule(db, id, selected);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add outfits',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
              <ThemedText style={{ color: theme.accent, fontSize: 16 }}>Cancel</ThemedText>
            </Pressable>
          ),
        }}
      />

      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <FlatList
          data={available}
          keyExtractor={(outfit) => outfit.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <EmptyState
              icon="rectangle.stack"
              title={outfits.length ? 'All of them are in already' : 'No outfits yet'}
              body={
                outfits.length
                  ? 'Every outfit you have is already in this capsule.'
                  : 'Build a few outfits first — they can be grouped afterwards.'
              }
            />
          }
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={item.name ?? `${item.entries.length}-piece look`}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: isSelected ? theme.accent : theme.border,
                    borderWidth: isSelected ? 1.5 : StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <Icon
                  name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                  size={22}
                  color={isSelected ? theme.accent : theme.textTertiary}
                />
                <View style={styles.thumbs}>
                  {item.entries.slice(0, 4).map(({ item: piece }) => (
                    <View key={piece.id} style={styles.thumb}>
                      <ItemImage item={piece} radius={Radius.sm - 4} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={{ fontWeight: '600', fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
                    {item.name || `${item.entries.length}-piece look`}
                  </ThemedText>
                  <ThemedText style={[styles.meta, { color: theme.textTertiary }]}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {item.archivedAt ? ' · ARCHIVED' : ''}
                  </ThemedText>
                </View>
              </Pressable>
            );
          }}
        />

        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <Button
            label={
              selected.length
                ? `Add ${selected.length} ${selected.length === 1 ? 'outfit' : 'outfits'}`
                : 'Select outfits to add'
            }
            size="lg"
            fullWidth
            disabled={!selected.length}
            loading={saving}
            onPress={save}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  thumbs: { flexDirection: 'row', gap: 3 },
  thumb: { width: 30, height: 38, borderRadius: Radius.sm - 4, overflow: 'hidden' },
  meta: { ...Type.label, textTransform: 'uppercase' },
  footer: { padding: Spacing.four, paddingBottom: Spacing.five, borderTopWidth: 0.5 },
});
