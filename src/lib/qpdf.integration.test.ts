import { createQpdf, type Qpdf } from "@mssio/qpdf-wasm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  assertOutput,
  describeQpdfError,
  ensureNoOpenPassword,
  PasswordProtectedError,
  UnreadablePdfError,
} from "@/lib/qpdf";
import { isLinearized, parseQpdfJson, QPDF_JSON_ARGS } from "@/lib/pdf-info";
import { generateOwnerPassword } from "@/lib/passwords";
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

  test("names a file that isn't a readable PDF", async () => {
    const error = await ensureNoOpenPassword(qpdf, pdfFile(new TextEncoder().encode("hello"), "notes.pdf")).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UnreadablePdfError);
    expect((error as UnreadablePdfError).fileName).toBe("notes.pdf");
    expect(describeQpdfError(error, "run").message).toBe("This file isn't a readable PDF.");
    expect(describeQpdfError(error, "run", { nameFiles: true }).message).toBe("“notes.pdf” isn't a readable PDF.");
  });
});

describe("encrypt", () => {
  test("protects with AES-256 and the chosen permissions", async () => {
    const { output } = await qpdf.encrypt(pdfFile(makePdf(2)), {
      userPassword: "new-pass",
      ownerPassword: generateOwnerPassword(),
      allow: { print: false, modify: true, extract: true, annotate: true },
    });
    assertOutput(output);
    await expect(qpdf.info(output.slice())).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const json = await qpdf.run(["--password=new-pass", "--json", "--json-key=encrypt", "in.pdf"], {
      files: { "in.pdf": output.slice() },
    });
    const encrypt = JSON.parse(json.stdout).encrypt;
    expect(encrypt.parameters.method).toBe("AESv3");
    expect(encrypt.capabilities.printhigh).toBe(false);
    expect(encrypt.capabilities.extract).toBe(true);
  });

  test("re-protects a restriction-only PDF", async () => {
    const { output } = await qpdf.encrypt(pdfFile(await restrictionOnly()), {
      userPassword: "fresh",
      ownerPassword: generateOwnerPassword(),
    });
    expect((await qpdf.info(output.slice(), { password: "fresh" })).encrypted).toBe(true);
  });
});

describe("merge", () => {
  test("3 + 2 pages make 5, and the output is not encrypted even from a restricted input", async () => {
    const { output } = await qpdf.merge([pdfFile(await restrictionOnly(3)), pdfFile(makePdf(2))]);
    assertOutput(output);
    expect(await qpdf.info(output.slice())).toMatchObject({ pageCount: 5, encrypted: false });
  });
});

describe("selectPages", () => {
  test("1,4-z of 5 pages gives 3 pages", async () => {
    const { output } = await qpdf.selectPages(pdfFile(makePdf(5)), "1,4-z");
    assertOutput(output);
    expect((await qpdf.info(output.slice())).pageCount).toBe(3);
  });

  test("keeps owner restrictions", async () => {
    const { output } = await qpdf.selectPages(pdfFile(await restrictionOnly(3)), "1");
    expect((await qpdf.info(output.slice())).encrypted).toBe(true);
  });

  test("out-of-range pages show qpdf's reason as detail", async () => {
    const error = await qpdf.selectPages(pdfFile(makePdf(5)), "9").catch((e: unknown) => e);
    const described = describeQpdfError(error, "run");
    expect(described.message).toBe("Could not process this PDF.");
    expect(described.detail).toContain("out of range");
  });
});

describe("compress", () => {
  test("returns a smaller valid PDF for a repetitive document", async () => {
    const input = makePdf(200);
    const { output } = await qpdf.compress(pdfFile(input));
    assertOutput(output);
    expect(output.length).toBeLessThan(input.length);
    expect((await qpdf.info(output.slice())).pageCount).toBe(200);
  });

  test("keeps owner restrictions", async () => {
    const { output } = await qpdf.compress(pdfFile(await restrictionOnly()));
    expect((await qpdf.info(output.slice())).encrypted).toBe(true);
  });
});

describe("info JSON", () => {
  test("detects linearization", async () => {
    const check = (file: File) => qpdf.run(["--check-linearization", "in.pdf"], { files: { "in.pdf": file } });
    expect(isLinearized(await check(pdfFile(makePdf(3))))).toBe(false);
    expect(isLinearized(await check(pdfFile((await qpdf.linearize(pdfFile(makePdf(3)))).output)))).toBe(true);
  });

  test("parses live qpdf --json output", async () => {
    const result = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], {
      files: { "in.pdf": pdfFile(makePdf(2, { title: "Hello" })) },
    });
    expect(result.exitCode).toBe(0);
    const details = parseQpdfJson(JSON.parse(result.stdout));
    expect(details.document).toMatchObject({ title: "Hello", author: "Test Author" });
    expect(details.document.created?.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(details.firstPageSize?.name).toBe("Letter");
    expect(details.mixedSizes).toBe(false);
    expect(details.security).toEqual({ encrypted: false });
  });

  test("reports restrictions of a restriction-only PDF", async () => {
    const result = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": pdfFile(await restrictionOnly()) } });
    expect(parseQpdfJson(JSON.parse(result.stdout)).security).toEqual({
      encrypted: true,
      method: "AES-256",
      denied: ["Printing"],
    });
  });
});
