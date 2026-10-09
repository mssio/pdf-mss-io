import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { formatElapsed } from "@/lib/format";
import type { JobStatusState } from "@/lib/job-progress";

const LARGE_FILE_BYTES = 50 * 1024 * 1024;

const STEP_TEXT: Record<Exclude<JobStatusState["phase"], "run">, string> = {
  load: "Loading the PDF engine…",
  finishing: "Finishing…",
};

/**
 * The running job's step and elapsed time, plus a hint for large files. While qpdf writes, a bar
 * shows its progress; after 100% the step reads "Finishing…" (the job may still check the output).
 */
export function JobStatus({ status }: { status: JobStatusState | null }) {
  const [now, setNow] = useState(() => Date.now());
  const running = status !== null;

  // Keyed on `running`, not `status`: progress replaces `status` several times a second, and
  // restarting the interval on each update would freeze the clock.
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  if (!status) return null;
  const step = status.phase === "run" ? status.label : STEP_TEXT[status.phase];
  return (
    <div className="grid gap-1.5 text-sm text-muted-foreground">
      <div role="status" aria-live="polite" className="grid gap-0.5">
        <p className="tabular-nums">
          {step}{" "}
          {/* Not announced: a live region that changes every second would drown out screen readers. */}
          <span aria-hidden="true">{formatElapsed(now - status.startedAt)}</span>
        </p>
        {status.sizeBytes > LARGE_FILE_BYTES ? <p className="text-xs">Large files can take a few minutes on phones.</p> : null}
      </div>
      {status.percent !== null ? (
        // Outside the live region: screen readers can query the bar, but percentages aren't announced.
        <div className="flex items-center gap-2">
          <Progress value={status.percent} aria-label={status.label} className="flex-1" />
          <span aria-hidden="true" className="w-9 text-right text-xs tabular-nums">
            {status.percent}%
          </span>
        </div>
      ) : null}
    </div>
  );
}
