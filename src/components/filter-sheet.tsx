import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  COLORS,
  FORMALITY_LABEL,
  PATTERNS,
  SEASONS,
  type Pattern,
  type Season,
} from '@/lib/taxonomy';

/** Everything the closet can be narrowed by, beyond category and search. */
export type ClosetFilters = {
  colors: string[];
  patterns: Pattern[];
  formality: number[];
  seasons: Season[];
  tags: string[];
  /** Benched pieces are hidden unless asked for. */
  includeBenched: boolean;
};

export const EMPTY_FILTERS: ClosetFilters = {
  colors: [],
  patterns: [],
  formality: [],
  seasons: [],
  tags: [],
  includeBenched: false,
};

/**
 * How many narrowings are in play. Drives the badge on the filter button, so
 * it's never a mystery why the grid looks short.
 */
export function activeFilterCount(filters: ClosetFilters): number {
  return (
    filters.colors.length +
    filters.patterns.length +
    filters.formality.length +
    filters.seasons.length +
    filters.tags.length +
    (filters.includeBenched ? 1 : 0)
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.three }}>
      <ThemedText style={[styles.groupLabel, { color: theme.textTertiary }]}>{title}</ThemedText>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

export function FilterSheet({
  visible,
  filters,
  onChange,
  onClose,
  tagOptions,
}: {
  visible: boolean;
  filters: ClosetFilters;
  onChange: (next: ClosetFilters) => void;
  onClose: () => void;
  tagOptions: string[];
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const count = activeFilterCount(filters);

  const patch = (next: Partial<ClosetFilters>) => onChange({ ...filters, ...next });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => onChange({ ...EMPTY_FILTERS })}
            disabled={count === 0}
            accessibilityRole="button"
            hitSlop={10}>
            <ThemedText
              type="small"
              style={{ fontWeight: '600', color: count ? theme.accent : theme.textTertiary }}>
              Reset
            </ThemedText>
          </Pressable>

          <ThemedText style={{ fontWeight: '700', fontSize: 17, lineHeight: 22 }}>
            Filters
          </ThemedText>

          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <ThemedText type="small" style={{ fontWeight: '600', color: theme.accent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
          showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.switchRow,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={{ fontWeight: '600', fontSize: 16, lineHeight: 21 }}>
                Show benched
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {"Pieces you've pulled out of rotation"}
              </ThemedText>
            </View>
            <Switch
              value={filters.includeBenched}
              onValueChange={(includeBenched) => patch({ includeBenched })}
              trackColor={{ true: theme.accent, false: theme.borderStrong }}
              accessibilityLabel="Show benched pieces"
            />
          </View>

          <Group title="Colour">
            {COLORS.map((color) => (
              <Chip
                key={color.name}
                label={color.name}
                swatch={color.hex}
                size="sm"
                selected={filters.colors.includes(color.name)}
                onPress={() => patch({ colors: toggle(filters.colors, color.name) })}
              />
            ))}
          </Group>

          <Group title="Pattern">
            {PATTERNS.map((pattern) => (
              <Chip
                key={pattern}
                label={pattern[0].toUpperCase() + pattern.slice(1)}
                size="sm"
                selected={filters.patterns.includes(pattern)}
                onPress={() => patch({ patterns: toggle(filters.patterns, pattern) })}
              />
            ))}
          </Group>

          <Group title="Formality">
            {[1, 2, 3, 4, 5].map((level) => (
              <Chip
                key={level}
                label={FORMALITY_LABEL[level]}
                size="sm"
                selected={filters.formality.includes(level)}
                onPress={() => patch({ formality: toggle(filters.formality, level) })}
              />
            ))}
          </Group>

          <Group title="Season">
            {SEASONS.map((season) => (
              <Chip
                key={season}
                label={season[0].toUpperCase() + season.slice(1)}
                size="sm"
                selected={filters.seasons.includes(season)}
                onPress={() => patch({ seasons: toggle(filters.seasons, season) })}
              />
            ))}
          </Group>

          {tagOptions.length ? (
            <Group title="Tags">
              {tagOptions.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="sm"
                  selected={filters.tags.includes(tag)}
                  onPress={() => patch({ tags: toggle(filters.tags, tag) })}
                />
              ))}
            </Group>
          ) : null}

          <Button label="Show results" size="lg" fullWidth onPress={onClose} />
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
  content: { padding: Spacing.four, gap: Spacing.five },
  groupLabel: { ...Type.label, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
