import { Loader2, ShieldCheck } from "lucide-react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/format";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { describePageSize, isLinearized, parseQpdfJson, QPDF_JSON_ARGS, type PdfDetails } from "@/lib/pdf-info";
import { ensureNoOpenPassword } from "@/lib/qpdf";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type Inspection = {
  fileName: string;
  fileSize: number;
  pdfVersion: string;
  pageCount: number;
  linearized: boolean;
  details: PdfDetails;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function InspectionDetails({ inspection }: { inspection: Inspection }) {
  const { details } = inspection;
  const doc = details.document;
  const textRows: [string, string | undefined][] = [
    ["Title", doc.title],
    ["Author", doc.author],
    ["Subject", doc.subject],
    ["Keywords", doc.keywords],
    ["Creator", doc.creator],
    ["Producer", doc.producer],
    ["Created", doc.created?.toLocaleString()],
    ["Modified", doc.modified?.toLocaleString()],
  ];
  const documentRows = textRows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="flex flex-col gap-4">
      <Group title="Document">
        {documentRows.length > 0 ? (
          documentRows.map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))
        ) : (
          <p className="py-1.5 text-sm text-muted-foreground">No document properties.</p>
        )}
      </Group>
      <Separator />
      <Group title="Pages">
        <Row label="Pages">{inspection.pageCount}</Row>
        <Row label="PDF version">{inspection.pdfVersion}</Row>
        {details.firstPageSize ? (
          <Row label="Page size">
            {details.mixedSizes ? "Mixed sizes · first page: " : ""}
            {describePageSize(details.firstPageSize)}
          </Row>
        ) : null}
      </Group>
      <Separator />
      <Group title="Security">
        {details.security.encrypted ? (
          <>
            <Row label="Encryption">
              Restrictions only (opens without a password){" "}
              {details.security.method ? <Badge variant="secondary">{details.security.method}</Badge> : null}
            </Row>
            <Row label="Not allowed">
              {details.security.denied.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {details.security.denied.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </span>
              ) : (
                "Nothing"
              )}
            </Row>
          </>
        ) : (
          <Row label="Encryption">Not encrypted</Row>
        )}
      </Group>
      <Separator />
      <Group title="Other">
        <Row label="File size">{formatBytes(inspection.fileSize)}</Row>
        <Row label="Fast web view">{inspection.linearized ? <Badge variant="secondary">Linearized</Badge> : "No"}</Row>
        <Row label="Attachments">
          {details.attachments.length > 0
            ? details.attachments.map((name, index) => (
                <Fragment key={`${name}-${index}`}>
                  {index > 0 ? ", " : ""}
                  {name}
                </Fragment>
              ))
            : "None"}
        </Row>
      </Group>
    </div>
  );
}

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
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
    const result = await job.run(async (qpdf): Promise<Inspection> => {
      const info = await ensureNoOpenPassword(qpdf, file);
      const json = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": file } });
      if (json.exitCode !== 0 && json.exitCode !== 3) throw new Error(json.stderr.trim() || "qpdf --json failed");
      const linearization = await qpdf.run(["--check-linearization", "in.pdf"], { files: { "in.pdf": file } });
      return {
        fileName: file.name,
        fileSize: file.size,
        pdfVersion: info.pdfVersion,
        pageCount: info.pageCount,
        linearized: isLinearized(linearization),
        details: parseQpdfJson(JSON.parse(json.stdout)),
      };
    });
    if (result) setInspection(result);
  }

  function inspectAnother() {
    job.reset();
    setFile(null);
    setInspection(null);
  }

  if (inspection) {
    return (
      <ResultCard
        title={inspection.details.document.title ?? inspection.fileName}
        description={`${inspection.fileName} · ${formatBytes(inspection.fileSize)}`}
        anotherLabel="Inspect another file"
        onAnother={inspectAnother}
      >
        <InspectionDetails inspection={inspection} />
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="PDF info"
      intro="See a PDF's properties, page size, restrictions and attachments. Inspection runs entirely in your browser."
      cardTitle="Inspect"
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
                Inspecting…
              </>
            ) : (
              "Inspect"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
