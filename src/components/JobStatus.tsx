import { useEffect, useState } from "react";

import type { JobStatusState } from "@/lib/use-qpdf-job";

const LARGE_FILE_BYTES = 50 * 1024 * 1024;

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The running job's step and elapsed time (qpdf reports no percentage), plus a hint for large files. */
export function JobStatus({ status }: { status: JobStatusState | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!status) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [status]);

  if (!status) return null;
  const step = status.phase === "load" ? "Loading the PDF engine…" : status.label;
  return (
    <div role="status" aria-live="polite" className="grid gap-0.5 text-sm text-muted-foreground">
      <p className="tabular-nums">
        {step}{" "}
        {/* Not announced: a live region that changes every second would drown out screen readers. */}
        <span aria-hidden="true">{formatElapsed(now - status.startedAt)}</span>
      </p>
      {status.sizeBytes > LARGE_FILE_BYTES ? <p className="text-xs">Large files can take a few minutes on phones.</p> : null}
    </div>
  );
}
