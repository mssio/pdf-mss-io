import { Check, Clock } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { isEngineFile, offlineLabel, offlinePercent, type OfflineState } from "@/lib/offline-status";
import { useOfflineStatus } from "@/lib/use-offline-status";

const HELP: Record<OfflineState["kind"], string> = {
  ready: "PDF Toolbox works without a connection on this device.",
  downloading: "Keep PDF Toolbox open until this says Ready offline. After that it works without a connection.",
  "not-ready": "Open PDF Toolbox once while online and keep it open until this says Ready offline.",
  unsupported: "This address can't keep files for offline use. Open PDF Toolbox from its https:// address.",
};

/** /offline: whether this device can use the app offline, and the download's progress. */
export function Component() {
  const snapshot = useOfflineStatus();
  if (!snapshot) return null;
  const { state, expected, cached } = snapshot;
  const have = new Set(cached);
  // Offline, sw.js (and so the expected list) can't be fetched; once ready, the cache holds every file.
  const files = expected ?? (state.kind === "ready" ? cached : null);
  const engine = files?.find(isEngineFile);
  const percent = offlinePercent(state);

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold">{offlineLabel(state)}</h1>
          <CardDescription>{HELP[state.kind]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {state.kind === "downloading" && percent !== null ? (
            <Progress value={percent} aria-label="Downloading for offline use" />
          ) : null}
          {engine && state.kind !== "unsupported" ? (
            <p className="text-sm">PDF engine: {have.has(engine) ? "downloaded" : "waiting"}</p>
          ) : null}
          {files && state.kind !== "unsupported" ? (
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {files.map((path) => (
                <li key={path} className="flex items-center gap-2 break-all">
                  {have.has(path) ? <Check className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
                  {path}
                </li>
              ))}
            </ul>
          ) : null}
          <Button className="w-full sm:w-auto" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
