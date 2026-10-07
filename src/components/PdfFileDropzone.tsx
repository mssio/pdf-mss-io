import { FileText, Upload } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickPdfFiles } from "@/lib/pdf-files";
import { cn } from "@/lib/utils";

type PdfFileDropzoneProps = {
  id: string;
  label?: string;
  /** Accept several files per pick/drop; each batch is passed to onFiles. */
  multiple?: boolean;
  disabled?: boolean;
  /** Single mode: the chosen file's name, shown in the zone. */
  selectedName?: string | null;
  onFiles: (files: File[]) => void;
  onInvalid: (message: string) => void;
};

export function PdfFileDropzone({
  id,
  label = "PDF file",
  multiple = false,
  disabled,
  selectedName,
  onFiles,
  onInvalid,
}: PdfFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const hintId = useId();
  const labelId = useId();
  const nameId = useId();

  function handle(files: File[]) {
    const { accepted, rejectedCount } = pickPdfFiles(files, multiple);
    if (accepted.length === 0) {
      onInvalid(rejectedCount > 0 ? "File must be a PDF." : "Choose a PDF file.");
      return;
    }
    onFiles(accepted);
    if (rejectedCount > 0) {
      onInvalid(`Skipped ${rejectedCount} ${rejectedCount === 1 ? "file that isn't a PDF" : "files that aren't PDFs"}.`);
    }
  }

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    handle(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="grid gap-2">
      <Label id={labelId} htmlFor={id}>{label}</Label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-describedby={selectedName && !multiple ? `${nameId} ${hintId}` : hintId}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onClick={openPicker}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "relative flex min-h-[9.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-[color,box-shadow,border-color,background-color]",
          "border-input bg-muted/20 outline-none hover:bg-muted/35 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDragging && "border-primary bg-primary/5 ring-[3px] ring-ring/50",
          disabled && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <Input
          ref={inputRef}
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            handle(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = "";
          }}
        />
        {selectedName && !multiple ? (
          <>
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p id={nameId} className="text-sm font-medium break-all">{selectedName}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              Drop another PDF or click to replace
            </p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{multiple ? "Drag and drop PDFs here" : "Drag and drop a PDF here"}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              {multiple ? "or click to browse; files are added to the list" : "or click to browse"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
