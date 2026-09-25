import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureImage, persistImage } from '@/lib/photos';

export type ItemCameraProps = {
  /** Names the saved file for the item this will become. */
  itemId: string;
  onCaptured: (relativePath: string) => void;
  onSkip: () => void;
  onCancel: () => void;
};

/**
 * The viewfinder half of adding a piece. Rendered as a mode of the new-item
 * screen rather than its own route: they're two steps of one task, and keeping
 * them in one stack entry means backing out always lands on the closet.
 */
export function ItemCamera({ itemId, onCaptured, onSkip, onCancel }: ItemCameraProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);

  async function shoot() {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 1 });
      if (!shot?.uri) throw new Error('The camera returned no image.');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onCaptured(await persistImage(shot.uri, itemId));
    } catch (error) {
      Alert.alert('Could not take that photo', String((error as Error).message ?? error));
      setBusy(false);
    }
  }

  async function fromLibrary() {
    setBusy(true);
    try {
      const path = await captureImage('library', itemId);
      // A cancelled picker should leave you in the viewfinder, not bounce out.
      if (path) onCaptured(path);
    } catch (error) {
      Alert.alert('Could not add that photo', String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: '#000' }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.fill,
          styles.centered,
          { backgroundColor: theme.background, padding: Spacing.six, gap: Spacing.four },
        ]}>
        <Icon name="camera.fill" size={32} color={theme.textTertiary} />
        <ThemedText style={styles.permissionTitle}>Camera access</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.permissionBody}>
          Photographing a piece is the quickest way to add it. You can still pick from your library
          or add one without a photo.
        </ThemedText>
        <View style={{ gap: Spacing.two, alignSelf: 'stretch' }}>
          <Button label="Allow camera" fullWidth onPress={requestPermission} />
          <Button label="Choose from library" variant="secondary" fullWidth onPress={fromLibrary} />
          <Button label="Add without a photo" variant="ghost" fullWidth onPress={onSkip} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <CameraView ref={camera} style={styles.fill} facing={facing} />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={12}
          style={styles.disc}>
          <Icon name="xmark" size={17} color="#FFFFFF" weight="semibold" />
        </Pressable>

        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Add without a photo"
          hitSlop={12}
          style={styles.skip}>
          <ThemedText style={styles.skipText}>Skip</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.five }]}>
        <Pressable
          onPress={fromLibrary}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Choose from library"
          hitSlop={12}
          style={styles.disc}>
          <Icon name="photo.on.rectangle" size={19} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={shoot}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          style={({ pressed }) => [styles.shutterRing, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={styles.shutterCore}>{busy ? <ActivityIndicator color="#000" /> : null}</View>
        </Pressable>

        <Pressable
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
          hitSlop={12}
          style={styles.disc}>
          <Icon name="arrow.triangle.2.circlepath.camera" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const SCRIM = 'rgba(0,0,0,0.45)';

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  centered: { alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { ...Type.title, textAlign: 'center' },
  permissionBody: { textAlign: 'center', lineHeight: 21 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.six,
  },
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCRIM,
  },
  skip: {
    paddingHorizontal: Spacing.four,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCRIM,
  },
  skipText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '600' },
  shutterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
