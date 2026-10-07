import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { clearCrashedJob, hadCrashedJob } from "@/lib/crash-guard";

/** Explains a reload that cut off a running job (see src/lib/crash-guard.ts). Shown once. */
export function CrashNotice() {
  const [visible, setVisible] = useState(hadCrashedJob);

  useEffect(() => {
    clearCrashedJob();
  }, []);

  if (!visible) return null;
  return (
    <div className="mx-auto max-w-lg px-4 pt-6 sm:px-6">
      <Alert className="border-amber-500/50 text-amber-800 dark:text-amber-300">
        <TriangleAlert />
        <AlertDescription className="text-current">
          <p>
            The page reloaded while a file was being processed, usually because the file was too big for this
            device's memory. Try a smaller file or a computer.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setVisible(false)}>
            Dismiss
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
