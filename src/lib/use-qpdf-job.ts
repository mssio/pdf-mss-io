import type { Qpdf } from "@mssio/qpdf-wasm";
import { useCallback, useEffect, useRef, useState } from "react";

import { markJobFinished, markJobStarted } from "@/lib/crash-guard";
import {
  describeQpdfError,
  type ErrorDescription,
  getQpdf,
  type JobPhase,
  JobTimeoutError,
  jobTimeoutMs,
  resetQpdf,
} from "@/lib/qpdf";

/** What a running job is doing, for JobStatus. */
export type JobStatusState = { phase: JobPhase; label: string; startedAt: number; sizeBytes: number };

export type RunOptions = {
  /** Step shown while qpdf works, e.g. "Encrypting…". */
  label?: string;
  /** Total input size; sets the time limit (jobTimeoutMs) and the large-file hint. */
  sizeBytes?: number;
};

/**
 * Busy, status and error state for one qpdf job at a time. Results that arrive after reset() or
 * unmount are dropped, so a slow job can't overwrite a newer screen. A job that runs past
 * jobTimeoutMs() fails with JobTimeoutError and the (presumably stuck) engine is replaced.
 */
export function useQpdfJob({ nameFiles = false }: { nameFiles?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [status, setStatus] = useState<JobStatusState | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const run = useCallback(
    async <T>(job: (qpdf: Qpdf) => Promise<T>, { label = "Working…", sizeBytes = 0 }: RunOptions = {}): Promise<T | null> => {
      const id = ++generation.current;
      const startedAt = Date.now();
      setBusy(true);
      setError(null);
      setStatus({ phase: "load", label, startedAt, sizeBytes });
      let phase: JobPhase = "load";
      let timer: ReturnType<typeof setTimeout> | undefined;
      markJobStarted();
      try {
        const work = (async () => {
          const qpdf = await getQpdf();
          phase = "run";
          if (id === generation.current) setStatus({ phase: "run", label, startedAt, sizeBytes });
          return job(qpdf);
        })();
        work.catch(() => {}); // if the time limit wins, a late failure must not surface as unhandled
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new JobTimeoutError()), jobTimeoutMs(sizeBytes));
        });
        const result = await Promise.race([work, timeout]);
        return id === generation.current ? result : null;
      } catch (caught) {
        if (caught instanceof JobTimeoutError) resetQpdf();
        if (id === generation.current) setError(describeQpdfError(caught, phase, { nameFiles }));
        return null;
      } finally {
        clearTimeout(timer);
        markJobFinished();
        if (id === generation.current) {
          setBusy(false);
          setStatus(null);
        }
      }
    },
    [nameFiles],
  );

  const reset = useCallback(() => {
    generation.current++;
    setBusy(false);
    setError(null);
    setStatus(null);
  }, []);
  const fail = useCallback((message: string) => setError({ message }), []);
  const clearError = useCallback(() => setError(null), []);

  return { busy, error, status, run, reset, fail, clearError };
}
