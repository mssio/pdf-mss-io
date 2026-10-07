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
  job: (engine: E) => Promise<T>;
  loadMs: number;
  jobMs: number;
  /** Called once the engine has loaded and the job starts. */
  onRun: () => void;
};

/**
 * Loads the engine, then runs the job, each under its own time limit. A load that finishes after its
 * limit never starts the job; a job's late failure after its limit is swallowed.
 */
export async function runWithTimeLimits<E, T>({ load, job, loadMs, jobMs, onRun }: TimeLimitedRun<E, T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = (ms: number, error: Error) =>
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(error), ms);
    });
  try {
    const engine = await Promise.race([load(), limit(loadMs, new EngineLoadTimeoutError())]);
    clearTimeout(timer);
    onRun();
    const work = job(engine);
    work.catch(() => {}); // if the time limit wins, the job's late failure must not surface as unhandled
    return await Promise.race([work, limit(jobMs, new JobTimeoutError())]);
  } finally {
    clearTimeout(timer);
  }
}
