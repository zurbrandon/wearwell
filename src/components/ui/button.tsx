import type { SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: SFSymbol;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { sm: 34, md: 44, lg: 54 };
const FONT: Record<Size, number> = { sm: 14, md: 15, lg: 17 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  fullWidth,
  style,
}: ButtonProps) {
  const theme = useTheme();

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.accent, fg: theme.accentText, border: 'transparent' },
    secondary: { bg: theme.backgroundElement, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', fg: theme.textSecondary, border: 'transparent' },
    danger: { bg: theme.backgroundElement, fg: theme.negative, border: 'transparent' },
  };

  const inactive = disabled || loading;
  // Fading a filled accent against black just muddies it, so disabled gets its
  // own flat treatment instead of an opacity knock-down.
  const { bg, fg, border } = disabled
    ? { bg: theme.backgroundElement, fg: theme.textTertiary, border: 'transparent' }
    : palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          backgroundColor: bg,
          borderColor: border,
          opacity: loading ? 0.6 : pressed ? 0.75 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: size === 'sm' ? Spacing.three : Spacing.five,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={FONT[size] + 2} color={fg} weight="semibold" /> : null}
          <ThemedText style={{ color: fg, fontSize: FONT[size], fontWeight: '600' }}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
