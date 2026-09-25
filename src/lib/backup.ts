import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

import type { BackupData } from '@/db/backup';

const IMAGE_DIR = 'closet-images';
const DATA_ENTRY = 'backup.json';
const IMAGE_ENTRY_PREFIX = 'images/';

function imageDirectory(): Directory {
  const dir = new Directory(Paths.document, IMAGE_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type ExportResult = { uri: string; filename: string; imageCount: number; bytes: number };

/**
 * Writes a single `.zip` holding the database snapshot and every photo.
 *
 * One file is the point: it can be AirDropped, saved to Files or mailed without
 * the photos and the data drifting apart.
 */
export async function writeBackupArchive(data: BackupData): Promise<ExportResult> {
  const zip = new JSZip();
  zip.file(DATA_ENTRY, JSON.stringify(data, null, 2));

  const images = zip.folder('images');
  let imageCount = 0;

  for (const entry of imageDirectory().list()) {
    if (entry instanceof Directory) continue;
    try {
      images?.file(entry.name, await (entry as File).bytes());
      imageCount += 1;
    } catch {
      // A single unreadable photo shouldn't cost you the whole backup.
    }
  }

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    // Photos are already JPEG, so heavy compression buys almost nothing and
    // costs a lot of time on a phone.
    compressionOptions: { level: 1 },
  });

  const filename = `outfit-backup-${stamp(data.exportedAt)}.zip`;
  const destination = new File(Paths.cache, filename);
  if (destination.exists) destination.delete();
  destination.create();
  destination.write(bytes);

  return { uri: destination.uri, filename, imageCount, bytes: bytes.byteLength };
}

export async function shareBackup(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Save your closet backup',
  });
  return true;
}

export type ReadBackupResult = { data: BackupData; imagesRestored: number };

/**
 * Opens a picked archive: restores every photo to the managed folder, and
 * returns the data for the database half.
 *
 * Images are written first so that if the database import fails, the photos
 * are already in place for a retry.
 */
export async function readBackupArchive(uri: string): Promise<ReadBackupResult> {
  const zip = await JSZip.loadAsync(await new File(uri).bytes());

  const dataEntry = zip.file(DATA_ENTRY);
  if (!dataEntry) {
    throw new Error("That doesn't look like an Outfit backup — no backup.json inside.");
  }

  const data = JSON.parse(await dataEntry.async('string')) as BackupData;
  const directory = imageDirectory();
  let imagesRestored = 0;

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(IMAGE_ENTRY_PREFIX)) continue;

    const name = path.slice(IMAGE_ENTRY_PREFIX.length);
    if (!name) continue;

    try {
      const target = new File(directory, name);
      if (target.exists) target.delete();
      target.create();
      target.write(await entry.async('uint8array'));
      imagesRestored += 1;
    } catch {
      // Keep going — a missing photo degrades to the colour placeholder.
    }
  }

  return { data, imagesRestored };
}

/** Returns the picked archive's URI, or null if the user backed out. */
export async function pickBackupArchive(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'public.zip-archive'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
