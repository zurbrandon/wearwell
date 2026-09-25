import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { addOutfitsToCapsule, capsulesForOutfit, createCapsule, listCapsules } from '@/db/capsules';
import {
  archiveOutfit,
  deleteOutfit,
  getOutfit,
  markWorn,
  restoreOutfit,
  setFavorite,
} from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { SLOT_LABEL } from '@/lib/taxonomy';
import type { Capsule, Outfit } from '@/lib/types';

export default function OutfitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();

  const { data: outfit, loading } = useQuery((d) => getOutfit(d, id), null as Outfit | null, [id]);
  const { data: capsules } = useQuery((d) => listCapsules(d), [] as Capsule[]);
  const { data: memberOf } = useQuery((d) => capsulesForOutfit(d, id), [] as string[], [id]);

  if (loading || !outfit) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  const archived = outfit.archivedAt != null;
  const inCapsules = capsules.filter((capsule) => memberOf.includes(capsule.id));

  function promptAddToCapsule() {
    if (!outfit) return;
    const available = capsules.filter((capsule) => !memberOf.includes(capsule.id));

    const create = () =>
      Alert.prompt(
        'New capsule',
        'Name it for the trip or occasion.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create',
            onPress: async (name?: string) => {
              if (!name?.trim()) return;
              const capsuleId = await createCapsule(db, name);
              await addOutfitsToCapsule(db, capsuleId, [outfit.id]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ],
        'plain-text'
      );

    if (!available.length) {
      create();
      return;
    }

    const labels = available.map((capsule) => capsule.name);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Add to capsule', options: ['Cancel', ...labels, 'New capsule…'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 0) return;
          if (index === labels.length + 1) return create();
          addOutfitsToCapsule(db, available[index - 1].id, [outfit.id]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      );
      return;
    }

    Alert.alert('Add to capsule', undefined, [
      ...available.map((capsule) => ({
        text: capsule.name,
        onPress: () => addOutfitsToCapsule(db, capsule.id, [outfit.id]),
      })),
      { text: 'New capsule…', onPress: create },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmDelete() {
    if (!outfit) return;
    Alert.alert('Delete this outfit?', 'The pieces stay in your closet.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteOutfit(db, outfit.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable
              onPress={() => setFavorite(db, outfit.id, !outfit.favorite)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={outfit.favorite ? 'Remove from favorites' : 'Add to favorites'}>
              <Icon
                name={outfit.favorite ? 'heart.fill' : 'heart'}
                size={20}
                color={outfit.favorite ? theme.accent : theme.textSecondary}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText style={styles.title}>
            {outfit.name || `${outfit.entries.length}-piece look`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Put together {new Date(outfit.createdAt).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
            })}
            {outfit.wornCount > 0 ? ` · worn ${outfit.wornCount}×` : ' · not worn yet'}
          </ThemedText>
        </View>

        <View style={{ gap: Spacing.three }}>
          {outfit.entries.map(({ slot, item }) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/item/${item.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <View style={styles.thumb}>
                <ItemImage item={item} radius={Radius.sm} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText style={styles.eyebrow} themeColor="textTertiary">
                  {SLOT_LABEL[slot]}
                </ThemedText>
                <ThemedText style={{ fontWeight: '600', fontSize: 16, lineHeight: 22 }} numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[item.brand, item.subcategory].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Icon name="chevron.right" size={14} color={theme.textTertiary} />
            </Pressable>
          ))}
        </View>

        <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
          {inCapsules.length ? (
            <View style={styles.capsuleRow}>
              {inCapsules.map((capsule) => (
                <Pressable
                  key={capsule.id}
                  onPress={() => router.push(`/collection/${capsule.id}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.capsuleChip,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Icon name="suitcase.fill" size={13} color={theme.accent} />
                  <ThemedText type="small" style={{ fontWeight: '600' }}>
                    {capsule.name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Button
            label="Add to capsule"
            icon="suitcase.fill"
            variant="secondary"
            fullWidth
            onPress={promptAddToCapsule}
          />
          <Button
            label="I wore this"
            icon="checkmark"
            size="lg"
            fullWidth
            onPress={() => {
              markWorn(db, outfit.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
          />
          <Button
            label={archived ? 'Move back to current' : 'Archive this outfit'}
            variant="secondary"
            fullWidth
            onPress={() => (archived ? restoreOutfit(db, outfit.id) : archiveOutfit(db, outfit.id))}
          />
          <Button label="Delete" variant="danger" fullWidth onPress={confirmDelete} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.eight },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  eyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 60, height: 76, borderRadius: Radius.sm, overflow: 'hidden' },
  capsuleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  capsuleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
});
