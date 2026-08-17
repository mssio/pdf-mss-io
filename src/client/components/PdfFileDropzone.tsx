import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import { FileText, Upload } from "lucide-react";

import { cn } from "@/client/lib/utils";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function assignFileToInput(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

type PdfFileDropzoneProps = {
  id: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
  onInvalidFile?: (message: string) => void;
  onFileAccepted?: () => void;
};

export function PdfFileDropzone({ id, name, disabled, required, onInvalidFile, onFileAccepted }: PdfFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const hintId = useId();

  const applyFile = useCallback(
    (file: File | null) => {
      const input = inputRef.current;
      if (!input) return;

      if (!file) {
        input.value = "";
        setSelectedName(null);
        return;
      }

      if (!isPdfFile(file)) {
        onInvalidFile?.("File must be a PDF.");
        return;
      }

      assignFileToInput(input, file);
      setSelectedName(file.name);
      onFileAccepted?.();
    },
    [onInvalidFile, onFileAccepted],
  );

  const onInputChange = () => {
    const file = inputRef.current?.files?.[0] ?? null;
    setSelectedName(file?.name ?? null);
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

    const file = e.dataTransfer.files[0];
    if (!file) {
      onInvalidFile?.("Choose a PDF file.");
      return;
    }
    applyFile(file);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>PDF file</Label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={id}
        aria-describedby={hintId}
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
          "border-input bg-muted/20 hover:bg-muted/35 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
          isDragging && "border-primary bg-primary/5 ring-ring/50 ring-[3px]",
          disabled && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept="application/pdf,.pdf"
          required={required}
          disabled={disabled}
          className="sr-only"
          onChange={onInputChange}
        />
        {selectedName ? (
          <>
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{selectedName}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              Drop another PDF or click to replace
            </p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Drag and drop a PDF here</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              or click to browse
            </p>
          </>
        )}
      </div>
    </div>
  );
}
