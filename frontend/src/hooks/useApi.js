import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';

/**
 * Fetch-with-state, so every page stops hand-rolling the same
 * useState/useEffect/console.error block -- and so failures actually surface.
 *
 *   const { data, loading, error, reload } = useApi('/inventory');
 */
export function useApi(path, { params, enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // Serialised so a fresh object literal each render doesn't retrigger the effect.
  const paramsKey = JSON.stringify(params ?? null);
  const activeRequest = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(path, { params: params ?? undefined });
      // Ignore a slow response that a newer request has already superseded.
      if (requestId === activeRequest.current) setData(response.data);
    } catch (err) {
      if (requestId === activeRequest.current && err?.response?.status !== 401) {
        setError(errorMessage(err));
      }
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
