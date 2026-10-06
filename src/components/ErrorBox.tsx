import { Link } from "react-router";

import type { ErrorDescription } from "@/lib/qpdf";

export function ErrorBox({ error }: { error: ErrorDescription }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      {error.detail ? <p className="mt-1 text-xs break-words text-muted-foreground">{error.detail}</p> : null}
      {error.decryptFirst ? (
        <Link to="/decrypt" className="mt-1 inline-block font-medium underline underline-offset-4">
          Go to Decrypt
        </Link>
      ) : null}
    </div>
  );
}
