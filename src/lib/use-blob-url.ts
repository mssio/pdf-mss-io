import { useCallback, useEffect, useState } from "react";

export type PdfDownload = { url: string; filename: string };

/** Owns one PDF blob URL; revokes it when replaced, cleared or on unmount. */
export function useBlobUrl() {
  const [download, setDownload] = useState<PdfDownload | null>(null);

  useEffect(() => {
    if (!download) return;
    return () => URL.revokeObjectURL(download.url);
  }, [download]);

  const show = useCallback((bytes: Uint8Array<ArrayBuffer>, filename: string) => {
    setDownload({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), filename });
  }, []);
  const clear = useCallback(() => setDownload(null), []);

  return { download, show, clear };
}
