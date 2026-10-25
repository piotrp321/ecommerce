import { useCallback, useEffect, useState } from 'react';

interface Settled<T> {
  load: () => Promise<T>;
  attempt: number;
  result: { ok: true; data: T } | { ok: false; error: unknown };
}

export interface AsyncState<T> {
  /** The last loaded data; kept while a new request is in flight. */
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Applies a local change (e.g. the API's answer to a mutation) without reloading. */
  update: (change: (data: T) => T) => void;
}

/**
 * Loads data with `load` (memoise it with useCallback; a new function means a
 * new request) and ignores answers that arrive after a newer request started.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) {
          setSettled({ load, attempt, result: { ok: true, data } });
        }
      },
      (error: unknown) => {
        if (current) {
          setSettled({ load, attempt, result: { ok: false, error } });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [load, attempt]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const update = useCallback((change: (data: T) => T) => {
    setSettled((previous) =>
      previous?.result.ok === true ? { ...previous, result: { ok: true, data: change(previous.result.data) } } : previous,
    );
  }, []);

  const loading = settled === null || settled.load !== load || settled.attempt !== attempt;
  const result = settled?.result;

  return {
    data: result?.ok === true ? result.data : undefined,
    error: !loading && result?.ok === false ? result.error : undefined,
    loading,
    reload,
    update,
  };
}
