import { Loader2, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { JobStatus } from "@/components/JobStatus";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SecretInput } from "@/components/ui/secret-input";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { assertOutput, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  function chooseFile(files: File[]) {
    setFile(files[0] ?? null);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || file.size === 0) {
      job.fail("Choose a PDF file.");
      return;
    }
    if (!sizeCheck.ok) return;
    const output = await job.run(async (qpdf, onProgress) => {
      const decrypted = await qpdf.decrypt(file, { password, onProgress });
      assertOutput(decrypted.output);
      logWarnings(decrypted.warnings);
      return decrypted.output;
    }, { label: "Decrypting…", sizeBytes: file.size });
    if (output) {
      result.show(output, outputFilename(file.name, "-d"));
      setPassword("");
    }
  }

  function decryptAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPassword("");
  }

  if (result.download) {
    return (
      <ResultCard
        durationMs={job.lastDurationMs}
        title="Your PDF is ready"
        description="Decrypted in your browser. Download it now; the file isn't stored anywhere."
        download={{ ...result.download, label: "Download decrypted PDF" }}
        anotherLabel="Decrypt another file"
        onAnother={decryptAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Decrypt PDF"
      intro={
        <>
          Upload an encrypted PDF and enter its password. Decryption runs entirely in your browser with{" "}
          <code className="rounded bg-muted px-1">qpdf</code> compiled to WebAssembly. Your file never leaves your
          device.
        </>
      }
      cardTitle="Decrypt"
      cardDescription={
        <>
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Your file and password stay on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <SecretInput
              id="password"
              disabled={job.busy}
              placeholder="Document open password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-help"
            />
            <p id="password-help" className="text-xs text-muted-foreground">
              Leave empty if the PDF opens without a password but has restrictions.
            </p>
          </div>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-x-4 gap-y-2 pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Decrypting…
              </>
            ) : (
              "Decrypt"
            )}
          </Button>
          <JobStatus status={job.status} />
        </CardFooter>
      </form>
    </ToolPage>
  );
}
