import type { Qpdf } from "@mssio/qpdf-wasm";
import { useCallback, useEffect, useRef, useState } from "react";

import { markJobFinished, markJobStarted } from "@/lib/crash-guard";
import { describeQpdfError, type ErrorDescription, getQpdf, type JobPhase } from "@/lib/qpdf";

/**
 * Busy and error state for one qpdf job at a time. Results that arrive after reset() or
 * unmount are dropped, so a slow job can't overwrite a newer screen.
 */
export function useQpdfJob({ nameFiles = false }: { nameFiles?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const run = useCallback(
    async <T>(job: (qpdf: Qpdf) => Promise<T>): Promise<T | null> => {
      const id = ++generation.current;
      setBusy(true);
      setError(null);
      let phase: JobPhase = "load";
      markJobStarted();
      try {
        const qpdf = await getQpdf();
        phase = "run";
        const result = await job(qpdf);
        return id === generation.current ? result : null;
      } catch (caught) {
        if (id === generation.current) setError(describeQpdfError(caught, phase, { nameFiles }));
        return null;
      } finally {
        markJobFinished();
        if (id === generation.current) setBusy(false);
      }
    },
    [nameFiles],
  );

  const reset = useCallback(() => {
    generation.current++;
    setBusy(false);
    setError(null);
  }, []);
  const fail = useCallback((message: string) => setError({ message }), []);
  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, reset, fail, clearError };
}
