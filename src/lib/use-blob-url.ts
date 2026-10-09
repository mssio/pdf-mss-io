import { useCallback, useEffect, useState } from "react";

import { guardDownload } from "@/lib/crash-guard";
import { shouldReleaseEngine } from "@/lib/qpdf";

export type PdfDownload = { url: string; filename: string };

/** Owns one PDF blob URL; revokes it when replaced, cleared or on unmount. */
export function useBlobUrl() {
  const [download, setDownload] = useState<PdfDownload | null>(null);

  useEffect(() => {
    if (!download) return;
    return () => URL.revokeObjectURL(download.url);
  }, [download]);

  const show = useCallback((bytes: Uint8Array<ArrayBuffer>, filename: string) => {
    const build = () => URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    // Only big outputs risk the phone running out of memory here. Guarding small ones would show a false
    // "page reloaded" notice when the user reloads (or updates) right after a job.
    const url = shouldReleaseEngine(bytes.length) ? guardDownload(build) : build();
    setDownload({ url, filename });
  }, []);
  const clear = useCallback(() => setDownload(null), []);

  return { download, show, clear };
}
