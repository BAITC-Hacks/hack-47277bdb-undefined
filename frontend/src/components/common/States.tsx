import { useEffect, useState, type DependencyList } from "react";
import { extractApiError, getApiErrorStatus } from "../../api/client";

export function LoadingSpinner() { return <p className="load-state" role="status">Жүктелуде…</p>; }
export function ErrorMessage({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><p>{message}</p>{retry && <button className="text-button" onClick={retry}>Қайталау</button>}</div>;
}
export function EmptyState({ message }: { message: string }) { return <p className="load-state">{message}</p>; }

// A stale request must never replace data after city, language or route changes.
export function useApiResource<T>(load: () => Promise<T>, dependencies: DependencyList, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<number | undefined>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (!enabled) { setData(null); setLoading(false); setError(""); return; }
    setLoading(true); setError(""); setStatus(undefined);
    load().then((value) => { if (active) setData(value); }).catch((reason: unknown) => {
      if (active) { setData(null); setError(extractApiError(reason)); setStatus(getApiErrorStatus(reason)); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // The caller specifies the inputs used by load, not the function identity.
  }, [...dependencies, enabled, revision]);
  return { data, loading, error, status, reload: () => setRevision((value) => value + 1) };
}
