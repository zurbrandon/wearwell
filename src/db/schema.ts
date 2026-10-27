import type { SQLiteDatabase } from 'expo-sqlite';

import { referencedImages } from '@/db/items';
import { LATEST_VERSION, MIGRATIONS } from '@/db/migrations';
import { pruneOrphanImages } from '@/lib/photos';

export const DATABASE_NAME = 'closet.db';

export { LATEST_VERSION, MIGRATIONS, SYNC_TABLES } from '@/db/migrations';

/**
 * Walks `MIGRATIONS` from whatever version this device is on up to the latest.
 *
 * Each step runs in its own transaction and bumps `user_version` with it, so
 * an interrupted upgrade — the app killed mid-migration — resumes from the
 * last completed step rather than half-applying one. Previously every step
 * shared a single `user_version` write at the end, which meant a crash partway
 * through replayed completed migrations on the next launch.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current >= LATEST_VERSION) return;

  for (let version = current; version < LATEST_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      // PRAGMA takes a literal, not a bound parameter; `version` is a loop
      // counter over a fixed-length array, never user input.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Housekeeping run once on start, after migrations. */
export async function sweep(db: SQLiteDatabase): Promise<void> {
  pruneOrphanImages(await referencedImages(db));
}
