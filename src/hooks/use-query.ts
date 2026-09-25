import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

export type QueryState<T> = {
  data: T;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

/**
 * Runs a read against the local database and re-runs it whenever the database
 * changes. The provider enables SQLite's update hook, so a write on any screen
 * refreshes every list showing that data — no manual invalidation.
 */
export function useQuery<T>(
  run: (db: SQLiteDatabase) => Promise<T>,
  initial: T,
  deps: readonly unknown[] = []
): QueryState<T> {
  const db = useSQLiteContext();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest closure without making it a dependency — callers pass
  // inline lambdas, which would otherwise refetch on every render. Assigned in
  // an effect rather than during render; this effect is declared before the
  // ones that read it, so the ref is current by the time they run.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await runRef.current(db);
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e as Error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [db]);

  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    refresh();
  }, [refresh, depsKey]);

  // A single write can emit several change events; coalesce them.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = addDatabaseChangeListener(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 40);
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
