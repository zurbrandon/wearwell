import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Renders a color swatch before the label. */
  swatch?: string;
  /** Leading emoji, as on the filter pills. */
  emoji?: string;
  size?: 'sm' | 'md';
};

export function Chip({ label, selected, onPress, swatch, emoji, size = 'md' }: ChipProps) {
  const theme = useTheme();
  const interactive = !!onPress;

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={interactive ? { selected: !!selected } : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
          paddingVertical: size === 'sm' ? Spacing.two - 2 : Spacing.three - 2,
          paddingHorizontal: size === 'sm' ? Spacing.three : Spacing.four,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {swatch ? (
        <View style={[styles.swatch, { backgroundColor: swatch, borderColor: theme.borderStrong }]} />
      ) : null}
      {emoji ? (
        <ThemedText style={{ fontSize: size === 'sm' ? 12 : 14, lineHeight: size === 'sm' ? 16 : 18 }}>
          {emoji}
        </ThemedText>
      ) : null}
      <ThemedText
        style={{
          fontSize: size === 'sm' ? 12 : 14,
          fontWeight: '600',
          color: selected ? theme.accentText : theme.text,
        }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
