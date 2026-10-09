import type { Qpdf } from "@mssio/qpdf-wasm";
import { useCallback, useEffect, useRef, useState } from "react";

import { markJobFinished, markJobStarted } from "@/lib/crash-guard";
import { jobFinished, jobStarted } from "@/lib/job-activity";
import { createOnProgress, type JobStatusState } from "@/lib/job-progress";
import {
  describeQpdfError,
  ENGINE_LOAD_TIMEOUT_MS,
  type ErrorDescription,
  getQpdf,
  type JobPhase,
  JobTimeoutError,
  jobTimeoutMs,
  resetQpdf,
  STALL_TIMEOUT_MS,
} from "@/lib/qpdf";
import { EngineLoadTimeoutError, runWithTimeLimits } from "@/lib/run-job";

export type RunOptions = {
  /** Step shown while qpdf works, e.g. "Encrypting…". */
  label: string;
  /** Total input size; sets the time limit (jobTimeoutMs) and the large-file hint. */
  sizeBytes: number;
};

/**
 * Busy, status and error state for one qpdf job at a time. Results and progress that arrive after
 * reset() or unmount are dropped, so a slow job can't overwrite a newer screen. The job receives an
 * `onProgress` to pass to the qpdf call that writes its download (only that one). An engine that
 * doesn't load within ENGINE_LOAD_TIMEOUT_MS, or a job that exceeds its time limit (see
 * runWithTimeLimits), fails with a clear message and the (presumably stuck) engine is replaced.
 */
export function useQpdfJob({ nameFiles = false }: { nameFiles?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [status, setStatus] = useState<JobStatusState | null>(null);
  /** How long the last successful job took, for the result page. */
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const run = useCallback(
    async <T>(
      job: (qpdf: Qpdf, onProgress: (percent: number) => void) => Promise<T>,
      { label, sizeBytes }: RunOptions,
    ): Promise<T | null> => {
      const id = ++generation.current;
      const isCurrent = () => id === generation.current;
      const startedAt = Date.now();
      setBusy(true);
      setError(null);
      setStatus({ phase: "load", label, startedAt, sizeBytes, percent: null });
      setLastDurationMs(null);
      let phase: JobPhase = "load";
      markJobStarted();
      jobStarted();
      try {
        const result = await runWithTimeLimits({
          load: getQpdf,
          job: (qpdf, progress) => job(qpdf, createOnProgress({ isCurrent, rearm: progress, setStatus })),
          loadMs: ENGINE_LOAD_TIMEOUT_MS,
          jobMs: jobTimeoutMs(sizeBytes),
          stallMs: STALL_TIMEOUT_MS,
          onRun: () => {
            phase = "run";
            if (isCurrent()) setStatus({ phase: "run", label, startedAt, sizeBytes, percent: null });
          },
        });
        if (!isCurrent()) return null;
        setLastDurationMs(Date.now() - startedAt);
        return result;
      } catch (caught) {
        if (caught instanceof JobTimeoutError || caught instanceof EngineLoadTimeoutError) resetQpdf();
        if (isCurrent()) setError(describeQpdfError(caught, phase, { nameFiles }));
        return null;
      } finally {
        markJobFinished();
        jobFinished();
        if (isCurrent()) {
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
    setLastDurationMs(null);
  }, []);
  const fail = useCallback((message: string) => setError({ message }), []);
  const clearError = useCallback(() => setError(null), []);

  return { busy, error, status, lastDurationMs, run, reset, fail, clearError };
}
