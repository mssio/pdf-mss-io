import { QpdfError } from "@mssio/qpdf-wasm";
import { describe, expect, test } from "vitest";

import {
  assertOutput,
  describeQpdfError,
  JobTimeoutError,
  jobTimeoutMs,
  OUT_OF_MEMORY_MESSAGE,
  PasswordProtectedError,
  TruncatedOutputError,
  UnreadablePdfError,
} from "@/lib/qpdf";

const pdfBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return bytes;
};

describe("assertOutput", () => {
  test("accepts a PDF of at least 64 bytes", () => expect(() => assertOutput(pdfBytes(64))).not.toThrow());
  test("rejects empty output", () => expect(() => assertOutput(new Uint8Array())).toThrow(TruncatedOutputError));
  test("rejects tiny output", () => expect(() => assertOutput(pdfBytes(63))).toThrow(TruncatedOutputError));
  test("rejects output without a PDF header", () =>
    expect(() => assertOutput(new Uint8Array(100))).toThrow(TruncatedOutputError));
});

describe("describeQpdfError", () => {
  test("load phase", () => {
    expect(describeQpdfError(new Error("fetch failed"), "load")).toEqual({
      message: "Couldn't load the PDF engine. Check your connection and reload.",
    });
  });

  test("password-protected input, unnamed and named", () => {
    const error = new PasswordProtectedError("tax.pdf");
    expect(describeQpdfError(error, "run")).toEqual({
      message: "This PDF is password-protected. Remove its password with Decrypt first.",
      decryptFirst: true,
    });
    expect(describeQpdfError(error, "run", { nameFiles: true })).toEqual({
      message: "“tax.pdf” is password-protected. Remove its password with Decrypt first.",
      decryptFirst: true,
    });
  });

  test("unreadable file, unnamed and named", () => {
    const error = new UnreadablePdfError("notes.pdf");
    expect(describeQpdfError(error, "run")).toEqual({ message: "This file isn't a readable PDF." });
    expect(describeQpdfError(error, "run", { nameFiles: true })).toEqual({
      message: "“notes.pdf” isn't a readable PDF.",
    });
  });

  test("wrong password in Decrypt", () => {
    expect(describeQpdfError(new QpdfError("INVALID_PASSWORD", "in.pdf: invalid password"), "run")).toEqual({
      message: "Incorrect password. Check it and try again.",
    });
  });

  test("not a PDF", () => {
    expect(describeQpdfError(new QpdfError("INVALID_PDF", "unable to find trailer"), "run")).toEqual({
      message: "This file isn't a readable PDF.",
    });
  });

  test.each(["std::bad_alloc", "Out of memory", "Aborted(OOM)", "qpdf crashed: RuntimeError"])(
    "out of memory: %s",
    (message) => {
      expect(describeQpdfError(new QpdfError("FAILED", message), "run")).toEqual({ message: OUT_OF_MEMORY_MESSAGE });
    },
  );

  test("truncated output is reported as out of memory", () => {
    expect(describeQpdfError(new TruncatedOutputError(), "run")).toEqual({ message: OUT_OF_MEMORY_MESSAGE });
  });

  test("anything else keeps qpdf's message as detail", () => {
    expect(describeQpdfError(new QpdfError("FAILED", "number 9 out of range"), "run")).toEqual({
      message: "Could not process this PDF.",
      detail: "number 9 out of range",
    });
    expect(describeQpdfError("boom", "run")).toEqual({ message: "Could not process this PDF.", detail: "boom" });
  });
});

describe("job time limit", () => {
  test("one minute plus one minute per started 25 MB", () => {
    expect(jobTimeoutMs(0)).toBe(60_000);
    expect(jobTimeoutMs(1)).toBe(120_000);
    expect(jobTimeoutMs(25 * 1024 * 1024)).toBe(120_000);
    expect(jobTimeoutMs(25 * 1024 * 1024 + 1)).toBe(180_000);
    expect(jobTimeoutMs(245 * 1024 * 1024)).toBe(660_000);
  });

  test("a timed-out job explains itself", () => {
    expect(describeQpdfError(new JobTimeoutError(), "run")).toEqual({
      message:
        "This file took too long to process on this device. It may be too big for its memory. Try a smaller file or a computer.",
    });
    expect(describeQpdfError(new JobTimeoutError(), "load")).toEqual({
      message:
        "This file took too long to process on this device. It may be too big for its memory. Try a smaller file or a computer.",
    });
  });
});
