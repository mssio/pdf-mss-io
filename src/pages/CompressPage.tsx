import { Info, Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { outputFilename } from "@/lib/filename";
import { describeSizeChange, sizeChange } from "@/lib/format";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type CompressSummary = { before: number; after: number; percent: number; smaller: boolean };

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CompressSummary | null>(null);
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
    const output = await job.run(async (qpdf) => {
      await ensureNoOpenPassword(qpdf, file);
      const compressed = await qpdf.compress(file);
      assertOutput(compressed.output);
      logWarnings(compressed.warnings);
      return compressed.output;
    });
    if (!output) return;
    const change = sizeChange(file.size, output.length);
    if (change.smaller) result.show(output, outputFilename(file.name, "-compressed"));
    setSummary({ before: file.size, after: output.length, ...change });
  }

  function compressAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setSummary(null);
  }

  if (summary) {
    return summary.smaller && result.download ? (
      <ResultCard
        title="Your PDF is smaller"
        description={describeSizeChange(summary.before, summary.after)}
        download={{ ...result.download, label: "Download compressed PDF" }}
        anotherLabel="Compress another file"
        onAnother={compressAnother}
      />
    ) : (
      <ResultCard
        title="No smaller version"
        description={describeSizeChange(summary.before, summary.after)}
        anotherLabel="Compress another file"
        onAnother={compressAnother}
      >
        <Alert>
          <Info />
          <AlertDescription>
            This PDF is already as small as qpdf can make it. qpdf compresses the PDF's structure but doesn't shrink
            images.
          </AlertDescription>
        </Alert>
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="Compress PDF"
      intro="Repacks and recompresses the PDF's internal data. Works best on text-heavy PDFs; scanned or photo-heavy files shrink little."
      cardTitle="Compress"
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
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Compressing…
              </>
            ) : (
              "Compress"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
