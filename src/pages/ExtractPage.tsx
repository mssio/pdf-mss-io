import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { JobStatus } from "@/components/JobStatus";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { normalizePageRanges } from "@/lib/page-ranges";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [ranges, setRanges] = useState("");
  const [extractedPages, setExtractedPages] = useState(0);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  async function chooseFile(files: File[]) {
    const chosen = files[0] ?? null;
    setFile(chosen);
    setPageCount(null);
    if (!chosen) return;
    if (!checkSize(chosen.size, likelyPhone).ok) {
      job.clearError();
      return;
    }
    const info = await job.run((qpdf) => ensureNoOpenPassword(qpdf, chosen), {
      label: "Counting pages…",
      sizeBytes: chosen.size,
    });
    if (info) setPageCount(info.pageCount);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || pageCount === null || !sizeCheck.ok) return;
    const normalized = normalizePageRanges(ranges);
    if (!normalized) {
      job.fail("Enter pages like 1-3,7 or 5-z.");
      return;
    }
    const extracted = await job.run(async (qpdf) => {
      const { output, warnings } = await qpdf.selectPages(file, normalized);
      assertOutput(output);
      logWarnings(warnings);
      return { output, pages: (await qpdf.info(output.slice())).pageCount };
    }, { label: "Extracting pages…", sizeBytes: file.size });
    if (extracted) {
      result.show(extracted.output, outputFilename(file.name, "-pages"));
      setExtractedPages(extracted.pages);
    }
  }

  function extractAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPageCount(null);
    setRanges("");
  }

  if (result.download) {
    return (
      <ResultCard
        title="Pages extracted"
        description={`Extracted ${extractedPages} ${extractedPages === 1 ? "page" : "pages"} in your browser.`}
        download={{ ...result.download, label: "Download extracted pages" }}
        anotherLabel="Extract from another file"
        onAnother={extractAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Extract pages"
      intro="Pick the pages you need and save them as a new PDF. Everything runs in your browser."
      cardTitle="Extract"
      cardDescription={
        <>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Your file stays on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={(files) => void chooseFile(files)}
            onInvalid={job.fail}
          />
          {pageCount !== null ? (
            <p className="text-sm text-muted-foreground">
              This PDF has {pageCount} {pageCount === 1 ? "page" : "pages"}.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="pages">Pages</Label>
            <Input
              id="pages"
              placeholder="1-3,7"
              autoComplete="off"
              disabled={job.busy}
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              aria-describedby="pages-help"
            />
            <p id="pages-help" className="text-xs text-muted-foreground">
              Examples: <code className="rounded bg-muted px-1">1-3</code>,{" "}
              <code className="rounded bg-muted px-1">1,4,7</code>, <code className="rounded bg-muted px-1">5-z</code>{" "}
              (z = last page).
            </p>
          </div>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-x-4 gap-y-2 pt-6">
          <Button
            type="submit"
            disabled={job.busy || pageCount === null || !sizeCheck.ok}
            className="w-full sm:w-auto"
          >
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Working…
              </>
            ) : (
              "Extract"
            )}
          </Button>
          <JobStatus status={job.status} />
        </CardFooter>
      </form>
    </ToolPage>
  );
}
