import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import {
  addOutfitsToCapsule,
  capsulesForOutfit,
  createCapsule,
  listCapsules,
  removeOutfitFromCapsule,
} from '@/db/capsules';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import type { Capsule } from '@/lib/types';

/**
 * Membership manager for one outfit.
 *
 * Every capsule is listed with its current state, so adding and removing are
 * the same gesture. This replaces an action sheet that could only ever add, and
 * that fell back to "create a new capsule" whenever its list came back
 * empty — including while the capsules were still loading, which made it look
 * as though none existed.
 */
export function CapsulePicker({
  outfitId,
  visible,
  onClose,
}: {
  outfitId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const { data: capsules, loading } = useQuery((d) => listCapsules(d), [] as Capsule[]);
  const { data: memberOf } = useQuery(
    (d) => capsulesForOutfit(d, outfitId),
    [] as string[],
    [outfitId]
  );

  const member = new Set(memberOf);

  function toggle(capsule: Capsule) {
    Haptics.selectionAsync();
    if (member.has(capsule.id)) {
      removeOutfitFromCapsule(db, capsule.id, outfitId);
    } else {
      addOutfitsToCapsule(db, capsule.id, [outfitId]);
    }
  }

  function promptCreate() {
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
            await addOutfitsToCapsule(db, id, [outfitId]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
      'plain-text'
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={{ width: 52 }} />
          <ThemedText style={{ fontWeight: '700', fontSize: 17, lineHeight: 22 }}>Capsules</ThemedText>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={{ width: 52, alignItems: 'flex-end' }}>
            <ThemedText type="small" style={{ fontWeight: '600', color: theme.accent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
          showsVerticalScrollIndicator={false}>
          {/* Only claim there are none once we actually know. */}
          {!loading && !capsules.length ? (
            <View style={styles.empty}>
              <Icon name="suitcase.fill" size={26} color={theme.textTertiary} />
              <ThemedText style={{ fontWeight: '600', fontSize: 17, lineHeight: 22 }}>
                No capsules yet
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>
                Group outfits for a trip or occasion, and the pieces to pack come with them.
              </ThemedText>
            </View>
          ) : (
            capsules.map((capsule) => {
              const isMember = member.has(capsule.id);
              return (
                <Pressable
                  key={capsule.id}
                  onPress={() => toggle(capsule)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isMember }}
                  accessibilityLabel={capsule.name}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: isMember ? theme.accent : theme.border,
                      borderWidth: isMember ? 1.5 : StyleSheet.hairlineWidth,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <Icon
                    name={isMember ? 'checkmark.circle.fill' : 'circle'}
                    size={22}
                    color={isMember ? theme.accent : theme.textTertiary}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText style={{ fontWeight: '600', fontSize: 16, lineHeight: 21 }} numberOfLines={1}>
                      {capsule.name}
                    </ThemedText>
                    <ThemedText style={[styles.meta, { color: theme.textTertiary }]}>
                      {capsule.outfitCount} {capsule.outfitCount === 1 ? 'OUTFIT' : 'OUTFITS'}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })
          )}

          <Button
            label="New capsule"
            icon="plus"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={promptCreate}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: { padding: Spacing.four, gap: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
  },
  meta: { ...Type.label, textTransform: 'uppercase' },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  emptyBody: { textAlign: 'center', maxWidth: 280, lineHeight: 20 },
});
