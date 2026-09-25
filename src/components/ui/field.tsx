import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, style, ...rest }: FieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {label ? (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textTertiary}
        {...rest}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            color: theme.text,
          },
          style,
        ]}
      />
      {hint ? (
        <ThemedText type="small" themeColor="textTertiary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={{ gap: 2 }}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textTertiary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  section: { gap: Spacing.three },
  label: { textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 },
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 46,
  },
});
