import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { exportData, importData, type BackupData } from '@/db/backup';
import { countItems } from '@/db/items';
import { countOutfits } from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import {
  formatBytes,
  pickBackupArchive,
  readBackupArchive,
  shareBackup,
  writeBackupArchive,
} from '@/lib/backup';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const { data: itemCount } = useQuery((d) => countItems(d), 0);
  const { data: outfitCount } = useQuery((d) => countOutfits(d, 'all'), 0);

  async function runExport() {
    setBusy('export');
    try {
      const data = await exportData(db);
      const result = await writeBackupArchive(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const shared = await shareBackup(result.uri);
      if (!shared) {
        Alert.alert(
          'Backup ready',
          `Saved as ${result.filename} (${formatBytes(result.bytes)}), but sharing isn't available on this device.`
        );
      }
    } catch (error) {
      Alert.alert('Could not back up', String((error as Error).message ?? error));
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    const uri = await pickBackupArchive();
    if (!uri) return;

    setBusy('import');
    try {
      const { data, imagesRestored } = await readBackupArchive(uri);
      confirmRestore(data, imagesRestored);
    } catch (error) {
      Alert.alert('Could not read that backup', String((error as Error).message ?? error));
      setBusy(null);
    }
  }

  function confirmRestore(data: BackupData, imagesRestored: number) {
    const incoming = data.tables?.items?.length ?? 0;
    const outfits = data.tables?.outfits?.length ?? 0;
    const taken = new Date(data.exportedAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    Alert.alert(
      'Restore this backup?',
      `From ${taken}: ${incoming} pieces, ${outfits} outfits, ${imagesRestored} photos.\n\n` +
        'Anything already here is kept. Pieces that match are updated, and the rest are added — nothing is deleted.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setBusy(null) },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              await importData(db, data);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Restored', `${incoming} pieces and ${outfits} outfits are back.`);
            } catch (error) {
              Alert.alert('Could not restore', String((error as Error).message ?? error));
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
            {itemCount} {itemCount === 1 ? 'PIECE' : 'PIECES'} · {outfitCount}{' '}
            {outfitCount === 1 ? 'OUTFIT' : 'OUTFITS'}
          </ThemedText>
          <ThemedText style={styles.title}>Your closet</ThemedText>
        </View>

        <View style={[styles.notice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Icon name="externaldrive.fill" size={18} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 20 }}>
            Everything lives on this phone — there is no account and nothing is stored anywhere
            else. A backup is the only copy that survives deleting the app.
          </ThemedText>
        </View>

        <View style={{ gap: Spacing.three }}>
          <ThemedText style={[styles.groupLabel, { color: theme.textTertiary }]}>Backup</ThemedText>
          <Button
            label="Back up everything"
            icon="square.and.arrow.up"
            size="lg"
            fullWidth
            loading={busy === 'export'}
            disabled={busy !== null}
            onPress={runExport}
          />
          <ThemedText type="small" themeColor="textTertiary" style={styles.hint}>
            Writes one .zip with every piece, outfit, capsule and photo, then hands it to the share
            sheet — save it to Files or iCloud Drive.
          </ThemedText>
        </View>

        <View style={{ gap: Spacing.three }}>
          <ThemedText style={[styles.groupLabel, { color: theme.textTertiary }]}>Restore</ThemedText>
          <Button
            label="Restore from a backup"
            icon="square.and.arrow.down"
            variant="secondary"
            size="lg"
            fullWidth
            loading={busy === 'import'}
            disabled={busy !== null}
            onPress={runImport}
          />
          <ThemedText type="small" themeColor="textTertiary" style={styles.hint}>
            Adds everything from the file back. Nothing already here is deleted.
          </ThemedText>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.eight },
  title: Type.display,
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  groupLabel: { ...Type.label, textTransform: 'uppercase' },
  hint: { lineHeight: 19, paddingHorizontal: Spacing.two },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
