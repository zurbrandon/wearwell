import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate, sweep } from '@/db/schema';

/**
 * Database startup, held outside React so it can be retried.
 *
 * `SQLiteProvider` caches its database promise at module level and hands the
 * same one back whenever `databaseName`, `options` and `onInit` match by
 * identity (see `getDatabaseAsync` in expo-sqlite/build/hooks.js). If `onInit`
 * rejects, that cached promise stays rejected forever: remounting the provider
 * re-reads it and `use()` throws the original error again without calling
 * `onInit`. Its cache-miss branch is no better — it chains off the rejected
 * promise, so the reopen never runs either.
 *
 * The practical upshot is that a migration failure surfaced through Suspense
 * cannot be retried in-process at all. So `initialise` deliberately does not
 * let one through. Opening the database is a separate step that already
 * succeeded by the time `onInit` runs, and that open handle is exactly what
 * makes a real retry possible: `retry` runs the migration again against it.
 *
 * `initialise` is a module-level function so its identity is stable. An inline
 * arrow in the layout would change on every render and make the provider close
 * and reopen the database underneath us.
 */

let failure: Error | null = null;
let database: SQLiteDatabase | null = null;
const listeners = new Set<() => void>();

function publish(next: Error | null): void {
  failure = next;
  for (const listener of listeners) listener();
}

export async function initialise(db: SQLiteDatabase): Promise<void> {
  database = db;

  try {
    await migrate(db);
    await sweep(db);
    publish(null);
  } catch (error) {
    console.error('Database initialisation failed', error);
    publish(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Run the migration again against the database that is already open.
 *
 * The current failure stays published until the new attempt settles. Clearing
 * it first would unmount the error screen and flash the closet on screen for
 * as long as the migration takes, only to replace it again on a second
 * failure.
 */
export async function retryInitialise(): Promise<boolean> {
  if (!database) return false;
  await initialise(database);
  return failure === null;
}

export function subscribeToFailure(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFailure(): Error | null {
  return failure;
}
