import { mkdir, truncate, writeFile } from "node:fs/promises";
import { createQpdf } from "@mssio/qpdf-wasm";

import { makePdf } from "../src/test/make-pdf";
import { FIXTURES_DIR, fixture } from "./paths";

/** Regenerates every test PDF before each run, so tests never depend on files outside the repo. */
export default async function globalSetup() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const qpdf = await createQpdf();
  try {
    await writeFile(fixture("plain.pdf"), makePdf(5, { title: "Plain sample" }));
    await writeFile(fixture("two-pages.pdf"), makePdf(2, { size: [595.28, 841.89] }));
    await writeFile(
      fixture("protected.pdf"),
      (await qpdf.encrypt(makePdf(3), { userPassword: "open-me", ownerPassword: "owner" })).output,
    );
    await writeFile(
      fixture("restricted.pdf"),
      (await qpdf.encrypt(makePdf(2), { userPassword: "", ownerPassword: "owner", allow: { print: false } })).output,
    );
    await writeFile(fixture("linearized.pdf"), (await qpdf.linearize(makePdf(3))).output);
    await writeFile(fixture("not-a-pdf.pdf"), "This is plain text, not a PDF.\n");
    await writeFile(fixture("empty.pdf"), "");
    await writeFile(fixture("oversize.pdf"), "");
    await truncate(fixture("oversize.pdf"), 260 * 1024 * 1024); // sparse; only its size is ever checked
    await writeFile(fixture("phone-oversize.pdf"), "");
    await truncate(fixture("phone-oversize.pdf"), 120 * 1024 * 1024); // over the phone limit, under the computer one
  } finally {
    qpdf.terminate();
  }
}
