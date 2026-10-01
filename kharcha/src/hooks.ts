import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

/** Loads data on mount and every time the screen regains focus. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const r = await fnRef.current();
      if (mine === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const first = useRef(true);
  // Dependency changes (e.g. another month) reload; the first run is covered by useFocusEffect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (first.current) { first.current = false; return; } setLoading(true); void reload(); }, deps);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { data, error, loading, reload };
}
