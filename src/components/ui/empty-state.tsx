import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: SFSymbol;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={26} color={theme.textTertiary} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {body}
      </ThemedText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: Spacing.two }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.seven,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 300, lineHeight: 21 },
});
