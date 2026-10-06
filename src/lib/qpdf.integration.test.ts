import { createQpdf, type Qpdf } from "@mssio/qpdf-wasm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { assertOutput, describeQpdfError, ensureNoOpenPassword, PasswordProtectedError } from "@/lib/qpdf";
import { makePdf } from "@/test/make-pdf";

let qpdf: Qpdf;
beforeAll(async () => {
  qpdf = await createQpdf();
});
afterAll(() => qpdf.terminate());

const pdfFile = (bytes: Uint8Array<ArrayBuffer>, name = "test.pdf") => new File([bytes], name, { type: "application/pdf" });

async function passwordProtected(pages = 2) {
  return (await qpdf.encrypt(makePdf(pages), { userPassword: "open-me", ownerPassword: "owner-secret" })).output;
}

async function restrictionOnly(pages = 2) {
  return (await qpdf.encrypt(makePdf(pages), { userPassword: "", ownerPassword: "owner-secret", allow: { print: false } }))
    .output;
}

describe("decrypt", () => {
  test("right password removes encryption", async () => {
    const { output } = await qpdf.decrypt(pdfFile(await passwordProtected()), { password: "open-me" });
    assertOutput(output);
    expect((await qpdf.info(output.slice())).encrypted).toBe(false);
  });

  test("wrong password is described as incorrect", async () => {
    const error = await qpdf.decrypt(pdfFile(await passwordProtected()), { password: "nope" }).catch((e: unknown) => e);
    expect(describeQpdfError(error, "run").message).toBe("Incorrect password. Check it and try again.");
  });

  test("empty password removes owner-only restrictions", async () => {
    const { output } = await qpdf.decrypt(pdfFile(await restrictionOnly()), { password: "" });
    expect((await qpdf.info(output.slice())).encrypted).toBe(false);
  });

  test("retries with the same File after a wrong password", async () => {
    const file = pdfFile(await passwordProtected());
    await expect(qpdf.decrypt(file, { password: "nope" })).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const { output } = await qpdf.decrypt(file, { password: "open-me" });
    expect((await qpdf.info(output.slice())).pageCount).toBe(2);
  });
});

describe("ensureNoOpenPassword", () => {
  test("rejects a PDF that needs a password to open", async () => {
    const error = await ensureNoOpenPassword(qpdf, pdfFile(await passwordProtected(), "tax.pdf")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PasswordProtectedError);
    expect((error as PasswordProtectedError).fileName).toBe("tax.pdf");
  });

  test("accepts a restriction-only PDF and reports it as encrypted", async () => {
    const info = await ensureNoOpenPassword(qpdf, pdfFile(await restrictionOnly(3)));
    expect(info).toMatchObject({ encrypted: true, pageCount: 3 });
  });

  test("accepts a plain PDF", async () => {
    expect(await ensureNoOpenPassword(qpdf, pdfFile(makePdf(4)))).toMatchObject({ encrypted: false, pageCount: 4 });
  });

  test("passes through non-PDF errors", async () => {
    const error = await ensureNoOpenPassword(qpdf, pdfFile(new TextEncoder().encode("hello"))).catch((e: unknown) => e);
    expect(describeQpdfError(error, "run").message).toBe("This file isn't a readable PDF.");
  });
});
