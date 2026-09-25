import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { ItemCamera } from '@/components/item-camera';
import { EMPTY_DRAFT, ItemForm, type ItemDraft } from '@/components/item-form';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { allTags, createItem } from '@/db/items';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import type { NewItem } from '@/lib/types';

function draftToItem(draft: ItemDraft, id: string): NewItem {
  return {
    id,
    name: draft.name.trim() || draft.subcategory || 'Untitled piece',
    category: draft.category,
    subcategory: draft.subcategory,
    brand: draft.brand.trim() || null,
    colors: draft.colors,
    pattern: draft.pattern,
    formality: draft.formality,
    seasons: draft.seasons,
    tags: draft.tags,
    imageUri: draft.imageUri,
    notes: draft.notes.trim() || null,
    source: 'manual',
    retailer: null,
    externalRef: null,
    price: null,
    currency: null,
    purchasedAt: null,
  };
}

/**
 * Adding a piece is camera-first: the viewfinder opens straight away and the
 * form follows once there's a photo (or you skip).
 *
 * Both steps live in this one screen on purpose. They were briefly two routes
 * with a `replace` between them, but the two had different presentations —
 * swapping a full-screen modal for a sheet made the native stack rebuild and
 * lose the screen underneath, so backing out of the form had nothing to go back
 * to. One entry, one task.
 */
export default function NewItemScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();

  const [mode, setMode] = useState<'camera' | 'form'>('camera');
  // Fixed up front so the photo is named for the item it will become.
  const [itemId] = useState(
    () => `itm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
  );
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const { data: tags } = useQuery((d) => allTags(d), []);

  /** Guarded: nothing should ever dispatch a back with an empty stack. */
  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function save() {
    setSaving(true);
    try {
      await createItem(db, draftToItem(draft, itemId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
    } catch (error) {
      Alert.alert('Could not save', String((error as Error).message ?? error));
      setSaving(false);
    }
  }

  if (mode === 'camera') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ItemCamera
          itemId={itemId}
          onCaptured={(photo) => {
            setDraft((current) => ({ ...current, imageUri: photo }));
            setMode('form');
          }}
          onSkip={() => setMode('form')}
          onCancel={close}
        />
      </>
    );
  }

  const canSave = draft.name.trim().length > 0 || draft.subcategory !== null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New item',
          headerLeft: () => (
            <Pressable onPress={close} accessibilityRole="button" hitSlop={12}>
              <ThemedText style={{ color: theme.accent, fontSize: 16 }}>Cancel</ThemedText>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ItemForm draft={draft} onChange={setDraft} imageKey={itemId} tagSuggestions={tags} />

        <View
          style={{
            padding: Spacing.four,
            paddingBottom: Spacing.five,
            borderTopWidth: 0.5,
            borderTopColor: theme.border,
            backgroundColor: theme.background,
          }}>
          <Button
            label="Add to closet"
            onPress={save}
            loading={saving}
            disabled={!canSave}
            size="lg"
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
