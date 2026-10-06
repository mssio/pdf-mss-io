import { Loader2, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { generateOwnerPassword, validateNewPassword } from "@/lib/passwords";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type Permission = "print" | "modify" | "extract" | "annotate";

const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "print", label: "Allow printing" },
  { key: "modify", label: "Allow editing" },
  { key: "extract", label: "Allow copying text and images" },
  { key: "annotate", label: "Allow comments and form filling" },
];

const ALL_ALLOWED: Record<Permission, boolean> = { print: true, modify: true, extract: true, annotate: true };

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [allow, setAllow] = useState(ALL_ALLOWED);
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
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      job.fail(invalid);
      return;
    }
    if (!sizeCheck.ok) return;
    const output = await job.run(async (qpdf) => {
      await ensureNoOpenPassword(qpdf, file);
      const encrypted = await qpdf.encrypt(file, {
        userPassword: password,
        ownerPassword: generateOwnerPassword(),
        allow,
      });
      assertOutput(encrypted.output);
      logWarnings(encrypted.warnings);
      return encrypted.output;
    });
    if (output) {
      result.show(output, outputFilename(file.name, "-protected"));
      setPassword("");
      setConfirm("");
    }
  }

  function protectAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPassword("");
    setConfirm("");
    setAllow(ALL_ALLOWED);
  }

  if (result.download) {
    return (
      <ResultCard
        title="Your PDF is protected"
        description="Encrypted with AES-256 in your browser. Anyone opening it will need the password."
        download={{ ...result.download, label: "Download protected PDF" }}
        anotherLabel="Protect another file"
        onAnother={protectAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Encrypt PDF"
      intro="Add a password and choose what people can do with the PDF. Encryption runs entirely in your browser."
      cardTitle="Encrypt"
      cardDescription={
        <>
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
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
            <Label htmlFor="password">Password to open</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              disabled={job.busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              disabled={job.busy}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <fieldset className="grid gap-3" disabled={job.busy}>
            <legend className="mb-2 text-sm font-medium">Permissions</legend>
            {PERMISSIONS.map((permission) => (
              <div key={permission.key} className="flex items-center gap-2">
                <Checkbox
                  id={`allow-${permission.key}`}
                  checked={allow[permission.key]}
                  onCheckedChange={(checked) => setAllow((current) => ({ ...current, [permission.key]: checked === true }))}
                />
                <Label htmlFor={`allow-${permission.key}`} className="font-normal">
                  {permission.label}
                </Label>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Permissions can't be changed later without the original file.</p>
          </fieldset>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Encrypting…
              </>
            ) : (
              "Encrypt"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
