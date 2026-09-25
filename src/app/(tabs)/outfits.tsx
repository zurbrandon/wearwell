import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollectionCard } from '@/components/collection-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing, TabBarHeight, Type } from '@/constants/theme';
import { createCapsule } from '@/db/capsules';
import { listCollections } from '@/db/collections';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import type { Collection } from '@/lib/types';

/**
 * A library of collections rather than a flat list of outfits — the same shape
 * as a music library, where playlists are the primary object and the built-in
 * ones (everything, liked) sit alongside the ones you made.
 */
export default function OutfitsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: collections } = useQuery((d) => listCollections(d), [] as Collection[]);
  const capsuleCount = collections.filter((c) => c.kind === 'capsule').length;

  function promptNewCapsule() {
    Alert.prompt(
      'New capsule',
      'Name it for the trip or occasion — New York, Work, Summer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name?: string) => {
            if (!name?.trim()) return;
            const id = await createCapsule(db, name);
            router.push(`/collection/${id}`);
          },
        },
      ],
      'plain-text'
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={collections}
        keyExtractor={(collection) => collection.id}
        contentContainerStyle={{
          paddingHorizontal: Spacing.four,
          paddingBottom: insets.bottom + TabBarHeight + Spacing.six,
          gap: Spacing.three,
        }}
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + Spacing.two, gap: Spacing.four }}>
            <View style={styles.titleRow}>
              <View style={{ gap: Spacing.one }}>
                <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
                  {capsuleCount
                    ? `${capsuleCount} ${capsuleCount === 1 ? 'CAPSULE' : 'CAPSULES'}`
                    : 'YOUR LIBRARY'}
                </ThemedText>
                <ThemedText style={styles.title}>Outfits</ThemedText>
              </View>
              <Button label="New" icon="plus" size="sm" onPress={promptNewCapsule} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <CollectionCard
            collection={item}
            onPress={() => router.push(`/collection/${item.id}`)}
          />
        )}
        ListFooterComponent={
          capsuleCount ? null : (
            <ThemedText type="small" themeColor="textTertiary" style={styles.hint}>
              Capsules group outfits for a trip or occasion — and work out the pieces to pack.
            </ThemedText>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: Type.display,
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  hint: { paddingTop: Spacing.three, paddingHorizontal: Spacing.two, lineHeight: 20 },
});
