/** What a running job is doing, for JobStatus. */
export type JobStatusState = {
  /** load: engine loading; run: qpdf working; finishing: qpdf wrote 100%, the job's last steps run. */
  phase: "load" | "run" | "finishing";
  label: string;
  startedAt: number;
  sizeBytes: number;
  /** qpdf's write progress, 0–99; null before qpdf starts writing and once it reaches 100. */
  percent: number | null;
};

/** The status after a write-progress call. A job that already ended (null) stays ended. */
export function withProgress(status: JobStatusState | null, percent: number): JobStatusState | null {
  if (!status) return null;
  return percent >= 100 ? { ...status, phase: "finishing", percent: null } : { ...status, phase: "run", percent };
}

type ProgressWiring = {
  /** False once the screen no longer shows this job (reset, unmount, a newer job). */
  isCurrent: () => boolean;
  /** Re-arms this job's time limit (runWithTimeLimits' `progress`). */
  rearm: (percent: number) => void;
  setStatus: (update: (status: JobStatusState | null) => JobStatusState | null) => void;
};

/** The `onProgress` one job receives. */
export function createOnProgress({ isCurrent, rearm, setStatus }: ProgressWiring): (percent: number) => void {
  return (percent) => {
    // Always re-arm: a stale job still occupies the shared engine, and if its limit expired,
    // resetQpdf() would kill the engine under the job the user started since.
    rearm(percent);
    if (isCurrent()) setStatus((status) => withProgress(status, percent));
  };
}
