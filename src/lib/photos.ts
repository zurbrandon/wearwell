import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Images live in the app's document directory under `IMAGE_DIR`.
 *
 * The database stores a *relative* path, never an absolute `file://` URI: on
 * iOS the app container UUID changes between installs, so a stored absolute
 * path goes stale and every photo silently 404s. `resolveImageUri` rebuilds the
 * absolute URI at render time.
 */
const IMAGE_DIR = 'closet-images';

/** Longest edge, in px. Plenty for a full-bleed card on a 3x phone. */
const MAX_EDGE = 1400;
const QUALITY = 0.82;

function imageDirectory(): Directory {
  const dir = new Directory(Paths.document, IMAGE_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Pulls a remote image into the managed folder so it survives offline and is
 * indistinguishable from a photo taken in the app.
 *
 * @returns the relative path to store on the item, or null if it couldn't be
 * fetched — a missing image is never worth losing the item over.
 */
export async function downloadImage(url: string, key: string): Promise<string | null> {
  try {
    const directory = imageDirectory();
    const filename = `${key}.jpg`;
    const destination = new File(directory, filename);

    if (destination.exists) return `${IMAGE_DIR}/${filename}`;

    await File.downloadFileAsync(url, destination, { idempotent: true });
    return destination.exists ? `${IMAGE_DIR}/${filename}` : null;
  } catch {
    return null;
  }
}

export function resolveImageUri(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  // Tolerate absolute URIs from older rows or external sources.
  if (relativePath.startsWith('file://') || relativePath.startsWith('http')) return relativePath;
  return new File(Paths.document, relativePath).uri;
}

export async function ensureLibraryPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return granted;
}

export async function ensureCameraPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  return granted;
}

export type PickSource = 'camera' | 'library';

/** Returns the picked image's temporary URI, or null if cancelled/denied. */
export async function pickImage(source: PickSource): Promise<string | null> {
  const granted = source === 'camera' ? await ensureCameraPermission() : await ensureLibraryPermission();
  if (!granted) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets.length) return null;
  return result.assets[0].uri;
}

/**
 * Downscales and copies an image into the managed folder.
 * @returns the relative path to store on the item.
 */
export async function persistImage(sourceUri: string, key: string): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri).resize({ width: MAX_EDGE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });

  const dir = imageDirectory();
  const filename = `${key}.jpg`;
  const destination = new File(dir, filename);
  if (destination.exists) destination.delete();

  await new File(saved.uri).move(destination);

  return `${IMAGE_DIR}/${filename}`;
}

/** Pick and persist in one step. Returns the relative path, or null. */
export async function captureImage(source: PickSource, key: string): Promise<string | null> {
  const picked = await pickImage(source);
  if (!picked) return null;
  return persistImage(picked, key);
}

/**
 * Removes stored images that no item points at.
 *
 * Capture-first means a photo is written before the item exists, so cancelling
 * the form — or swiping the sheet away, or crashing — leaves the file behind.
 * Sweeping on launch covers every one of those paths, including images whose
 * deletion failed when their item was removed.
 */
export function pruneOrphanImages(keep: ReadonlySet<string>): number {
  let removed = 0;

  try {
    for (const entry of imageDirectory().list()) {
      const name = entry.name;
      if (!name || entry instanceof Directory) continue;

      const relative = `${IMAGE_DIR}/${name}`;
      if (keep.has(relative)) continue;

      deleteImage(relative);
      removed += 1;
    }
  } catch {
    // Housekeeping must never keep the app from starting.
  }

  return removed;
}

export function deleteImage(relativePath: string | null | undefined): void {
  if (!relativePath || relativePath.startsWith('http')) return;
  try {
    const file = new File(Paths.document, relativePath);
    if (file.exists) file.delete();
  } catch {
    // A missing file is fine — we're deleting it anyway.
  }
}
