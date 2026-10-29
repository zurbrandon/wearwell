import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ItemImage } from '@/components/item-image';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Field, Section } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiAvailable, describeFailure, tagGarment } from '@/lib/foundation';
import { captureImage, imageAsBase64, type PickSource } from '@/lib/photos';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COLORS,
  FORMALITY_LABEL,
  PATTERNS,
  SEASONS,
  SUBCATEGORIES,
  type Category,
  type Pattern,
  type Season,
} from '@/lib/taxonomy';

export type ItemDraft = {
  name: string;
  brand: string;
  category: Category;
  subcategory: string | null;
  colors: string[];
  pattern: Pattern;
  formality: number;
  seasons: Season[];
  tags: string[];
  imageUri: string | null;
  notes: string;
};

export const EMPTY_DRAFT: ItemDraft = {
  name: '',
  brand: '',
  category: 'top',
  subcategory: null,
  colors: [],
  pattern: 'solid',
  formality: 2,
  seasons: [],
  tags: [],
  imageUri: null,
  notes: '',
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ItemForm({
  draft,
  onChange,
  imageKey,
  tagSuggestions = [],
  footer,
}: {
  draft: ItemDraft;
  onChange: (next: ItemDraft) => void;
  /** Filename stem for photos saved from this form. */
  imageKey: string;
  tagSuggestions?: string[];
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tagging, setTagging] = useState(false);

  const patch = (next: Partial<ItemDraft>) => onChange({ ...draft, ...next });

  async function choosePhoto(source: PickSource) {
    setBusy(true);
    try {
      const path = await captureImage(source, imageKey);
      if (path) {
        patch({ imageUri: path });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      Alert.alert('Could not add photo', String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Fill the form in from the photo.
   *
   * Opt-in per photo, never automatic: this is the only thing in Wearwell that
   * sends anything off the device, and it sends a picture of someone's
   * clothes. It also only ever *fills* fields — anything already typed is
   * left alone, so tapping it can't overwrite work.
   */
  async function fillFromPhoto() {
    if (!draft.imageUri || tagging) return;

    setTagging(true);
    try {
      const base64 = await imageAsBase64(draft.imageUri);
      const tagged = await tagGarment(base64);

      const next: Partial<ItemDraft> = {};
      if (tagged.name && !draft.name.trim()) next.name = tagged.name;
      if (tagged.category) next.category = tagged.category;
      if (tagged.subcategory && !draft.subcategory) next.subcategory = tagged.subcategory;
      if (tagged.colors?.length && !draft.colors.length) next.colors = tagged.colors;
      if (tagged.pattern) next.pattern = tagged.pattern;
      if (tagged.formality) next.formality = tagged.formality;
      if (tagged.seasons?.length && !draft.seasons.length) next.seasons = tagged.seasons;

      if (Object.keys(next).length === 0) {
        Alert.alert('Nothing to add', 'The photo didn’t tell us anything you haven’t filled in.');
        return;
      }

      patch(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const { title, message } = describeFailure(error);
      Alert.alert(title, message);
    } finally {
      setTagging(false);
    }
  }

  function promptForPhoto() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take photo', 'Choose from library'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) choosePhoto('camera');
          if (index === 2) choosePhoto('library');
        }
      );
      return;
    }

    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: () => choosePhoto('camera') },
      { text: 'Choose from library', onPress: () => choosePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function commitTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || draft.tags.includes(tag)) {
      setTagInput('');
      return;
    }
    patch({ tags: [...draft.tags, tag] });
    setTagInput('');
  }

  const unusedSuggestions = tagSuggestions.filter((t) => !draft.tags.includes(t)).slice(0, 8);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <Pressable
        onPress={promptForPhoto}
        accessibilityRole="button"
        accessibilityLabel={draft.imageUri ? 'Replace photo' : 'Add photo'}
        style={({ pressed }) => [styles.photo, { opacity: pressed ? 0.8 : 1 }]}>
        <ItemImage
          item={{ imageUri: draft.imageUri, category: draft.category, colors: draft.colors }}
          radius={Radius.lg}
          contentFit="cover"
        />
        <View style={[styles.photoAction, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Icon name={busy ? 'hourglass' : 'camera.fill'} size={15} color={theme.text} />
          <ThemedText type="small" style={{ fontWeight: '600' }}>
            {draft.imageUri ? 'Replace' : 'Add photo'}
          </ThemedText>
        </View>
      </Pressable>

      {draft.imageUri && aiAvailable() ? (
        <Pressable
          onPress={fillFromPhoto}
          disabled={tagging}
          accessibilityRole="button"
          accessibilityLabel="Fill in the details from this photo"
          accessibilityState={{ busy: tagging }}
          style={({ pressed }) => [
            styles.magic,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed || tagging ? 0.7 : 1,
            },
          ]}>
          {tagging ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Icon name="wand.and.stars" size={16} color={theme.accent} />
          )}
          <ThemedText type="small" style={{ fontWeight: '600' }}>
            {tagging ? 'Reading the photo…' : 'Fill in from photo'}
          </ThemedText>
        </Pressable>
      ) : null}

      <Field
        label="Name"
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        placeholder="Oxford shirt"
        autoCapitalize="sentences"
      />

      <Field
        label="Brand"
        value={draft.brand}
        onChangeText={(brand) => patch({ brand })}
        placeholder="Optional"
        autoCapitalize="words"
      />

      <Section title="Category">
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              selected={draft.category === c}
              onPress={() =>
                patch({
                  category: c,
                  // The old subcategory won't exist under the new category.
                  subcategory: c === draft.category ? draft.subcategory : null,
                })
              }
            />
          ))}
        </View>
      </Section>

      <Section title="Type">
        <View style={styles.wrap}>
          {SUBCATEGORIES[draft.category].map((s) => (
            <Chip
              key={s}
              label={s}
              selected={draft.subcategory === s}
              onPress={() => patch({ subcategory: draft.subcategory === s ? null : s })}
            />
          ))}
        </View>
      </Section>

      <Section title="Colors" subtitle="Pick up to three. Drives outfit matching.">
        <View style={styles.wrap}>
          {COLORS.map((c) => (
            <Chip
              key={c.name}
              label={c.name}
              swatch={c.hex}
              size="sm"
              selected={draft.colors.includes(c.name)}
              onPress={() => {
                const next = toggle(draft.colors, c.name);
                patch({ colors: next.slice(0, 3) });
              }}
            />
          ))}
        </View>
      </Section>

      <Section title="Pattern">
        <View style={styles.wrap}>
          {PATTERNS.map((p) => (
            <Chip
              key={p}
              label={p[0].toUpperCase() + p.slice(1)}
              selected={draft.pattern === p}
              onPress={() => patch({ pattern: p })}
            />
          ))}
        </View>
      </Section>

      <Section title="Formality">
        <View style={[styles.scale, { borderColor: theme.border }]}>
          {[1, 2, 3, 4, 5].map((level) => {
            const selected = draft.formality === level;
            return (
              <Pressable
                key={level}
                onPress={() => patch({ formality: level })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={FORMALITY_LABEL[level]}
                style={[
                  styles.scaleStep,
                  { backgroundColor: selected ? theme.accent : theme.backgroundElement },
                ]}>
                <ThemedText
                  type="small"
                  style={{ fontWeight: '700', color: selected ? theme.accentText : theme.textSecondary }}>
                  {level}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textTertiary">
          {FORMALITY_LABEL[draft.formality]}
        </ThemedText>
      </Section>

      <Section title="Seasons">
        <View style={styles.wrap}>
          {SEASONS.map((s) => (
            <Chip
              key={s}
              label={s[0].toUpperCase() + s.slice(1)}
              selected={draft.seasons.includes(s)}
              onPress={() => patch({ seasons: toggle(draft.seasons, s) })}
            />
          ))}
        </View>
      </Section>

      <Section title="Tags">
        {draft.tags.length ? (
          <View style={styles.wrap}>
            {draft.tags.map((tag) => (
              <Chip
                key={tag}
                label={`${tag}  ✕`}
                size="sm"
                selected
                onPress={() => patch({ tags: draft.tags.filter((t) => t !== tag) })}
              />
            ))}
          </View>
        ) : null}

        <Field
          label=""
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={() => commitTag(tagInput)}
          placeholder="Add a tag, then return"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />

        {unusedSuggestions.length ? (
          <View style={styles.wrap}>
            {unusedSuggestions.map((tag) => (
              <Chip key={tag} label={`+ ${tag}`} size="sm" onPress={() => commitTag(tag)} />
            ))}
          </View>
        ) : null}
      </Section>

      <Field
        label="Notes"
        value={draft.notes}
        onChangeText={(notes) => patch({ notes })}
        placeholder="Fit, alterations, anything worth remembering"
        multiline
        style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: Spacing.three }}
      />

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.eight },
  photo: {
    aspectRatio: 4 / 3,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  magic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoAction: {
    position: 'absolute',
    bottom: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  scale: { flexDirection: 'row', gap: Spacing.two },
  scaleStep: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
