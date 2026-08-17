import { useState, type FormEvent } from "react";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { PdfFileDropzone } from "@/client/components/PdfFileDropzone";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";

type SuccessState = {
  downloadUrl: string;
  expiresAt: string;
};

export function DecryptPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function resetToForm() {
    setSuccess(null);
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a PDF file.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/decrypt", { method: "POST", body: fd });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Request failed.";
        setError(msg);
        return;
      }
      if (
        typeof data === "object" &&
        data &&
        "downloadUrl" in data &&
        typeof (data as { downloadUrl: unknown }).downloadUrl === "string" &&
        "expiresAt" in data &&
        typeof (data as { expiresAt: unknown }).expiresAt === "string"
      ) {
        setSuccess({
          downloadUrl: (data as SuccessState).downloadUrl,
          expiresAt: (data as SuccessState).expiresAt,
        });
        form.reset();
      } else {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
        <Card>
          <CardHeader>
            <CardTitle>Your PDF is ready</CardTitle>
            <CardDescription>
              Link expires around{" "}
              <time dateTime={success.expiresAt}>{new Date(success.expiresAt).toLocaleString()}</time>. The file is
              removed from the server after <strong>15 minutes</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button className="w-full" asChild>
              <a href={success.downloadUrl} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" />
                Download decrypted PDF
              </a>
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button variant="outline" className="w-full sm:flex-1" asChild>
                <Link to="/">Back to home</Link>
              </Button>
              <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={resetToForm}>
                Decrypt another file
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Decrypt PDF</h1>
        <p className="mt-2 text-muted-foreground">
          Upload an encrypted PDF and enter its password. We run <code className="rounded bg-muted px-1">qpdf</code> on
          the server and give you a short-lived download link.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decrypt</CardTitle>
          <CardDescription className="flex items-start gap-2 pt-1">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              The decrypted file is deleted automatically after <strong>15 minutes</strong>. Download it before the link
              expires.
            </span>
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-6">
            <PdfFileDropzone
              id="file"
              name="file"
              required
              disabled={busy}
              onInvalidFile={(message) => setError(message)}
              onFileAccepted={() => setError(null)}
            />
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="off"
                required
                disabled={busy}
                placeholder="Document open password"
              />
            </div>
            {error ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Decrypting…
                </>
              ) : (
                "Decrypt"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
