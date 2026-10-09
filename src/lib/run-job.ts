import { JobTimeoutError } from "@/lib/qpdf";

/** The PDF engine didn't finish loading within its own time limit. */
export class EngineLoadTimeoutError extends Error {
  constructor() {
    super("The PDF engine didn't load in time");
    this.name = "EngineLoadTimeoutError";
  }
}

type TimeLimitedRun<E, T> = {
  load: () => Promise<E>;
  /** `progress(percent)` re-arms the job's time limit; see runWithTimeLimits. */
  job: (engine: E, progress: (percent: number) => void) => Promise<T>;
  loadMs: number;
  jobMs: number;
  /** Longest gap allowed between progress calls below 100%. */
  stallMs: number;
  /** Called once the engine has loaded and the job starts. */
  onRun: () => void;
};

/**
 * Loads the engine, then runs the job, each under its own time limit. The job's limit is jobMs until
 * it reports progress; each report below 100 resets it to stallMs, and 100 resets it to jobMs (for
 * work after writing). A load that finishes after its limit never starts the job; a job's late
 * failure after its limit is swallowed; progress after the run settled is ignored.
 */
export async function runWithTimeLimits<E, T>({
  load,
  job,
  loadMs,
  jobMs,
  stallMs,
  onRun,
}: TimeLimitedRun<E, T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire = () => {};
  let settled = false;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => expire(), ms);
  };
  const limit = (ms: number, error: Error) =>
    new Promise<never>((_, reject) => {
      expire = () => reject(error);
      arm(ms);
    });
  const progress = (percent: number) => {
    if (!settled) arm(percent < 100 ? stallMs : jobMs);
  };
  try {
    const engine = await Promise.race([load(), limit(loadMs, new EngineLoadTimeoutError())]);
    clearTimeout(timer);
    onRun();
    const deadline = limit(jobMs, new JobTimeoutError());
    const work = job(engine, progress);
    work.catch(() => {}); // if the time limit wins, the job's late failure must not surface as unhandled
    return await Promise.race([work, deadline]);
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
