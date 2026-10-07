import type { Qpdf } from "@mssio/qpdf-wasm";
import { useCallback, useEffect, useRef, useState } from "react";

import { markJobFinished, markJobStarted } from "@/lib/crash-guard";
import {
  describeQpdfError,
  ENGINE_LOAD_TIMEOUT_MS,
  type ErrorDescription,
  getQpdf,
  type JobPhase,
  JobTimeoutError,
  jobTimeoutMs,
  resetQpdf,
} from "@/lib/qpdf";
import { EngineLoadTimeoutError, runWithTimeLimits } from "@/lib/run-job";

/** What a running job is doing, for JobStatus. */
export type JobStatusState = { phase: JobPhase; label: string; startedAt: number; sizeBytes: number };

export type RunOptions = {
  /** Step shown while qpdf works, e.g. "Encrypting…". */
  label: string;
  /** Total input size; sets the time limit (jobTimeoutMs) and the large-file hint. */
  sizeBytes: number;
};

/**
 * Busy, status and error state for one qpdf job at a time. Results that arrive after reset() or
 * unmount are dropped, so a slow job can't overwrite a newer screen. An engine that doesn't load within
 * ENGINE_LOAD_TIMEOUT_MS, or a job that runs past jobTimeoutMs(), fails with a clear message and the
 * (presumably stuck) engine is replaced.
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
    async <T>(job: (qpdf: Qpdf) => Promise<T>, { label, sizeBytes }: RunOptions): Promise<T | null> => {
      const id = ++generation.current;
      const startedAt = Date.now();
      setBusy(true);
      setError(null);
      setStatus({ phase: "load", label, startedAt, sizeBytes });
      let phase: JobPhase = "load";
      markJobStarted();
      try {
        const result = await runWithTimeLimits({
          load: getQpdf,
          job,
          loadMs: ENGINE_LOAD_TIMEOUT_MS,
          jobMs: jobTimeoutMs(sizeBytes),
          onRun: () => {
            phase = "run";
            if (id === generation.current) setStatus({ phase: "run", label, startedAt, sizeBytes });
          },
        });
        return id === generation.current ? result : null;
      } catch (caught) {
        if (caught instanceof JobTimeoutError || caught instanceof EngineLoadTimeoutError) resetQpdf();
        if (id === generation.current) setError(describeQpdfError(caught, phase, { nameFiles }));
        return null;
      } finally {
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
