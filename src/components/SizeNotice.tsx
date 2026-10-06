import { TriangleAlert } from "lucide-react";

import { ErrorBox } from "@/components/ErrorBox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SizeCheck } from "@/lib/limits";

export function SizeNotice({ check }: { check: SizeCheck }) {
  if (!check.ok) return <ErrorBox error={{ message: check.message }} />;
  if (!check.phoneWarning) return null;
  return (
    <Alert className="border-amber-500/50 text-amber-800 dark:text-amber-300">
      <TriangleAlert />
      <AlertDescription className="text-current">
        Large files may fail on phones. If it doesn't work, try a computer.
      </AlertDescription>
    </Alert>
  );
}
