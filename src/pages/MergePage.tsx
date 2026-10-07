import { ArrowDown, ArrowUp, FileText, Info, Loader2, X } from "lucide-react";
import { useReducer, useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { JobStatus } from "@/components/JobStatus";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import { checkSize, isLikelyPhone, totalBytes } from "@/lib/limits";
import { mergeListReducer, toMergeItems, type MergeAction } from "@/lib/merge-list";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type MergeSummary = { files: number; pages: number; droppedRestrictions: boolean };

export function Component() {
  const [items, dispatch] = useReducer(mergeListReducer, []);
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob({ nameFiles: true });
  const result = useBlobUrl();
  const total = totalBytes(items.map((item) => item.file));
  const sizeCheck = checkSize(total, likelyPhone);

  function addFiles(files: File[]) {
    dispatch({ type: "add", items: toMergeItems(files) });
    job.clearError();
  }

  function changeList(action: MergeAction) {
    dispatch(action);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length < 2 || !sizeCheck.ok) return;
    const files = items.map((item) => item.file);
    const empty = files.find((file) => file.size === 0);
    if (empty) {
      job.fail(`“${empty.name}” is empty.`);
      return;
    }
    const merged = await job.run(async (qpdf) => {
      let droppedRestrictions = false;
      let pages = 0;
      for (const file of files) {
        const info = await ensureNoOpenPassword(qpdf, file);
        if (info.encrypted) droppedRestrictions = true;
        pages += info.pageCount;
      }
      const { output, warnings } = await qpdf.merge(files);
      assertOutput(output);
      logWarnings(warnings);
      return { output, summary: { files: files.length, pages, droppedRestrictions } };
    }, { label: "Merging…", sizeBytes: total });
    if (merged) {
      result.show(merged.output, "merged.pdf");
      setSummary(merged.summary);
    }
  }

  function mergeOthers() {
    result.clear();
    job.reset();
    setSummary(null);
    dispatch({ type: "clear" });
  }

  if (result.download && summary) {
    return (
      <ResultCard
        title="Your PDFs are merged"
        description={`${summary.files} files, ${summary.pages} pages.`}
        download={{ ...result.download, label: "Download merged PDF" }}
        anotherLabel="Merge other files"
        onAnother={mergeOthers}
      >
        {summary.droppedRestrictions ? (
          <Alert>
            <Info />
            <AlertDescription>Restrictions from the original files aren't kept in the merged PDF.</AlertDescription>
          </Alert>
        ) : null}
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="Merge PDFs"
      intro="Combine several PDFs into one, in the order you choose. Merging runs entirely in your browser."
      cardTitle="Merge"
      cardDescription="Add at least two PDFs, then put them in order."
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone id="files" label="PDF files" multiple disabled={job.busy} onFiles={addFiles} onInvalid={job.fail} />
          {items.length > 0 ? (
            <div className="grid gap-2">
              <ol className="grid gap-2">
                {items.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${item.file.name} up`}
                      disabled={job.busy || index === 0}
                      onClick={() => changeList({ type: "move", id: item.id, offset: -1 })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${item.file.name} down`}
                      disabled={job.busy || index === items.length - 1}
                      onClick={() => changeList({ type: "move", id: item.id, offset: 1 })}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${item.file.name}`}
                      disabled={job.busy}
                      onClick={() => changeList({ type: "remove", id: item.id })}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(total)}
              </p>
            </div>
          ) : null}
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-x-4 gap-y-2 pt-6">
          <Button type="submit" disabled={job.busy || items.length < 2 || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Merging…
              </>
            ) : (
              "Merge"
            )}
          </Button>
          <JobStatus status={job.status} />
        </CardFooter>
      </form>
    </ToolPage>
  );
}
