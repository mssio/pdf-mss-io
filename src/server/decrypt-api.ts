import { createWriteStream } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import busboy from "busboy";

/** Decrypted files are removed after this interval. */
export const DECRYPT_FILE_TTL_MS = 15 * 60 * 1000;

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
/** Max bytes for non-file fields (password). */
const MAX_FORM_FIELD_BYTES = 4096;

const EXPIRE_FILENAME = ".expire";
const CREATED_FILENAME = ".created";
/** UTF-8 original suggested download name (one line); optional for older job dirs. */
const DOWNLOAD_NAME_FILENAME = ".download-filename";
/** Job dirs with `.created` but no `.expire` (crash / failed run) are removed after this age. */
const ORPHAN_NO_EXPIRE_MS = 2 * 60 * 60 * 1000;
/** Hex-only dirs with no marker files (legacy) are removed if older than this by mtime. */
const LEGACY_DIR_MAX_MS = 24 * 60 * 60 * 1000;

const JOB_ID_RE = /^[a-f0-9]{48}$/;

function jobsBaseDir(): string {
  return process.env.TMP_DIR?.trim() || path.join(process.cwd(), "data", "tmp");
}

function headersForBusboy(h: Headers): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function fileTooLargeResponse(): Response {
  return Response.json(
    { error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` },
    { status: 413 },
  );
}

type DecryptMultipartOk = {
  password: string;
  originalFilename: string;
  fileMime: string;
  inputPath: string;
};

/**
 * Stream multipart body with busboy so `MAX_UPLOAD_BYTES` is enforced per file
 * while reading (not after buffering the whole body with `formData()`).
 */
async function parseDecryptMultipart(req: Request, jobDir: string): Promise<DecryptMultipartOk | Response> {
  const inputPath = path.join(jobDir, "input.pdf");
  const webBody = req.body;
  if (!webBody) {
    return Response.json({ error: "Missing request body." }, { status: 400 });
  }

  let nodeIn: Readable;
  try {
    type WebReadable = Parameters<typeof Readable.fromWeb>[0];
    nodeIn = Readable.fromWeb(webBody as unknown as WebReadable);
  } catch {
    return Response.json({ error: "Could not read upload stream." }, { status: 400 });
  }

  const bb = busboy({
    headers: headersForBusboy(req.headers),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 4,
      parts: 64,
      fields: 16,
      fieldSize: MAX_FORM_FIELD_BYTES,
    },
  });

  let password = "";
  let passwordTruncated = false;
  let filePartsSeen = 0;
  let fileWrite: Promise<void> | null = null;
  let originalFilename = "document.pdf";
  let fileMime = "";
  let earlyResponse: Response | null = null;
  let settled = false;

  const fail = (r: Response) => {
    if (!earlyResponse) earlyResponse = r;
    try {
      nodeIn.destroy();
    } catch {
      /* ignore */
    }
    try {
      bb.destroy();
    } catch {
      /* ignore */
    }
  };

  bb.on("field", (name, value, info) => {
    if (earlyResponse) return;
    if (name === "password") {
      if (info.valueTruncated) passwordTruncated = true;
      password = value;
    }
  });

  bb.on("file", (fieldname, file, info) => {
    if (earlyResponse) {
      file.resume();
      return;
    }
    if (fieldname !== "file") {
      file.resume();
      return;
    }

    filePartsSeen++;
    if (filePartsSeen > 1) {
      file.resume();
      fail(Response.json({ error: "Only one PDF file is allowed." }, { status: 400 }));
      return;
    }

    originalFilename = info.filename || "document.pdf";
    fileMime = info.mimeType || "";

    const ws = createWriteStream(inputPath);
    fileWrite = pipeline(file, ws).then(() => {
      if (file.truncated) {
        fail(fileTooLargeResponse());
        throw new Error("file_too_large");
      }
    });
  });

  bb.on("partsLimit", () => fail(Response.json({ error: "Too many form parts." }, { status: 400 })));
  bb.on("filesLimit", () => fail(Response.json({ error: "Too many file parts." }, { status: 400 })));
  bb.on("fieldsLimit", () => fail(Response.json({ error: "Too many form fields." }, { status: 400 })));

  const result = new Promise<DecryptMultipartOk | Response>((resolve) => {
    const finish = (out: DecryptMultipartOk | Response) => {
      if (settled) return;
      settled = true;
      resolve(out);
    };

    bb.on("close", () => {
      void (async () => {
        if (settled) return;
        if (earlyResponse) {
          finish(earlyResponse);
          return;
        }
        if (passwordTruncated) {
          finish(Response.json({ error: "Password is too long." }, { status: 400 }));
          return;
        }
        if (!fileWrite) {
          finish(Response.json({ error: "Please upload a PDF file." }, { status: 400 }));
          return;
        }
        try {
          await fileWrite;
        } catch {
          if (settled) return;
          finish(earlyResponse ?? Response.json({ error: "Upload failed." }, { status: 400 }));
          return;
        }
        if (settled) return;
        if (earlyResponse) {
          finish(earlyResponse);
          return;
        }
        let st;
        try {
          st = await stat(inputPath);
        } catch {
          finish(Response.json({ error: "Please upload a PDF file." }, { status: 400 }));
          return;
        }
        if (st.size === 0) {
          finish(Response.json({ error: "Please upload a PDF file." }, { status: 400 }));
          return;
        }
        if (st.size > MAX_UPLOAD_BYTES) {
          finish(fileTooLargeResponse());
          return;
        }
        if (!password) {
          finish(Response.json({ error: "Password is required." }, { status: 400 }));
          return;
        }
        finish({ password, originalFilename, fileMime, inputPath });
      })();
    });

    bb.on("error", (err) => {
      console.error("multipart parse", err);
      if (!earlyResponse) {
        earlyResponse = Response.json({ error: "Could not parse multipart form." }, { status: 400 });
      }
      finish(earlyResponse);
    });
  });

  nodeIn.on("error", (err) => {
    console.error("upload stream", err);
    fail(Response.json({ error: "Upload interrupted." }, { status: 400 }));
  });

  nodeIn.pipe(bb);

  return result;
}

export function qpdfExecutable(): string {
  return process.env.QPDF_PATH?.trim() || process.env.QPDF_BIN?.trim() || "qpdf";
}

/** `encrypted.pdf` → `encrypted-d.pdf` (insert `-d` before the last extension). */
export function decryptedDownloadFilename(uploadedName: string): string {
  const base = uploadedName.replace(/^.*[/\\]/, "").trim() || "document.pdf";
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) {
    return `${base.slice(0, dot)}-d${base.slice(dot)}`;
  }
  return `${base}-d.pdf`;
}

function contentDispositionAttachment(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\\r\n]/g, "_")
    .slice(0, 200);
  const encoded = encodeURIComponent(filename);
  if (ascii === filename) {
    return `attachment; filename="${ascii}"`;
  }
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

type DownloadRecord = {
  outputPath: string;
  jobDir: string;
  timer: ReturnType<typeof setTimeout>;
  downloadFilename: string;
};

const downloads = new Map<string, DownloadRecord>();

/**
 * Rebuild a `DownloadRecord` from disk after restart (or first request) when the
 * in-memory map was cleared but the job dir is still valid and unexpired.
 */
async function rehydrateDownloadRecord(jobId: string): Promise<DownloadRecord | null> {
  const existing = downloads.get(jobId);
  if (existing) return existing;

  if (!JOB_ID_RE.test(jobId)) return null;

  const jobDir = path.join(jobsBaseDir(), jobId);
  const expireFile = Bun.file(path.join(jobDir, EXPIRE_FILENAME));
  if (!(await expireFile.exists())) return null;

  const expireAt = Number((await expireFile.text()).trim());
  if (!Number.isFinite(expireAt) || Date.now() >= expireAt) {
    void purgeJob(jobId);
    return null;
  }

  const outputPath = path.join(jobDir, "decrypted.pdf");
  if (!(await Bun.file(outputPath).exists())) return null;

  const nameFile = Bun.file(path.join(jobDir, DOWNLOAD_NAME_FILENAME));
  let downloadFilename = "decrypted.pdf";
  if (await nameFile.exists()) {
    const raw = (await nameFile.text()).trim();
    if (raw) downloadFilename = raw.slice(0, 240);
  }

  const remainingMs = Math.max(1, expireAt - Date.now());
  const timer = setTimeout(() => {
    void purgeJob(jobId);
  }, remainingMs);

  const rec: DownloadRecord = { outputPath, jobDir, timer, downloadFilename };
  downloads.set(jobId, rec);
  return rec;
}

async function rehydrateAllDownloadsFromDisk(): Promise<void> {
  const base = jobsBaseDir();
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const jobId = String(ent.name);
    if (!JOB_ID_RE.test(jobId)) continue;
    await rehydrateDownloadRecord(jobId);
  }
}

/** Clears in-memory record (and timer), then removes the job directory from disk. */
export async function purgeJob(jobId: string): Promise<void> {
  const rec = downloads.get(jobId);
  if (rec) {
    clearTimeout(rec.timer);
    downloads.delete(jobId);
  }
  const jobDir = path.join(jobsBaseDir(), jobId);
  await rm(jobDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Removes expired decrypt jobs from disk. Complements per-job `setTimeout`:
 * survives process restarts and clears orphaned dirs.
 */
export async function sweepExpiredJobDirs(): Promise<void> {
  const base = jobsBaseDir();
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const jobId = String(ent.name);
    if (!JOB_ID_RE.test(jobId)) continue;

    const jobDir = path.join(base, jobId);
    const expireFile = Bun.file(path.join(jobDir, EXPIRE_FILENAME));

    if (await expireFile.exists()) {
      const raw = (await expireFile.text()).trim();
      const expireAt = Number(raw);
      if (Number.isFinite(expireAt) && now >= expireAt) {
        await purgeJob(jobId);
      }
      continue;
    }

    const createdFile = Bun.file(path.join(jobDir, CREATED_FILENAME));
    if (await createdFile.exists()) {
      const raw = (await createdFile.text()).trim();
      const createdAt = Number(raw);
      if (Number.isFinite(createdAt) && now - createdAt > ORPHAN_NO_EXPIRE_MS) {
        await purgeJob(jobId);
      }
      continue;
    }

    try {
      const st = await stat(jobDir);
      if (now - st.mtimeMs > LEGACY_DIR_MAX_MS) {
        await purgeJob(jobId);
      }
    } catch {
      /* ignore */
    }
  }
}

const CLEANUP_GUARD_KEY = "__pdfMssIo_decryptCleanupStarted";

/** Run one sweep on boot and on a cron schedule (timers still handle the common case). */
export function startDecryptJobCleanup(): void {
  void (async () => {
    await rehydrateAllDownloadsFromDisk();
    await sweepExpiredJobDirs();
  })();

  const g = globalThis as typeof globalThis & Record<string, unknown>;
  if (g[CLEANUP_GUARD_KEY]) return;
  g[CLEANUP_GUARD_KEY] = true;

  Bun.cron("*/5 * * * *", () => {
    void sweepExpiredJobDirs();
  });
}

export async function postDecrypt(req: Request): Promise<Response> {
  let jobDir: string | undefined;
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const cl = req.headers.get("content-length");
    if (cl) {
      const n = Number(cl);
      if (Number.isFinite(n) && n > MAX_UPLOAD_BYTES) {
        return Response.json(
          { error: `Request body too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` },
          { status: 413 },
        );
      }
    }

    const jobId = randomBytes(24).toString("hex");
    const base = jobsBaseDir();
    jobDir = path.join(base, jobId);
    await mkdir(jobDir, { recursive: true });
    await Bun.write(path.join(jobDir, CREATED_FILENAME), String(Date.now()));

    const parsed = await parseDecryptMultipart(req, jobDir);
    if (parsed instanceof Response) {
      await rm(jobDir, { recursive: true, force: true });
      jobDir = undefined;
      return parsed;
    }

    const { password, originalFilename, fileMime, inputPath } = parsed;
    const uploadBasename = originalFilename.replace(/^.*[/\\]/, "").trim() || "document.pdf";
    const nameLower = uploadBasename.toLowerCase();
    if (!nameLower.endsWith(".pdf") && fileMime !== "application/pdf") {
      await rm(jobDir, { recursive: true, force: true });
      jobDir = undefined;
      return Response.json({ error: "File must be a PDF." }, { status: 400 });
    }

    const outputPath = path.join(jobDir, "decrypted.pdf");

    const qpdf = qpdfExecutable();
    // Avoid `--password=...` in argv (visible in `ps`); qpdf reads first line from stdin.
    const proc = Bun.spawn([qpdf, "--password-file=-", "--decrypt", inputPath, outputPath], {
      stdin: new TextEncoder().encode(password),
      stdout: "pipe",
      stderr: "pipe",
    });
    const exit = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exit !== 0) {
      await rm(jobDir, { recursive: true, force: true });
      const hint =
        stderr.trim() ||
        (exit === 127 || exit === 1 ? "Is qpdf installed? Use brew install qpdf or set QPDF_PATH." : "");
      return Response.json(
        {
          error: "Could not decrypt this PDF. Check the password and that the file is password-protected.",
          detail: process.env.NODE_ENV !== "production" ? hint : undefined,
        },
        { status: 422 },
      );
    }

    const downloadFilename = decryptedDownloadFilename(uploadBasename);
    const expireAt = Date.now() + DECRYPT_FILE_TTL_MS;
    await Bun.write(path.join(jobDir, EXPIRE_FILENAME), String(expireAt));
    await Bun.write(path.join(jobDir, DOWNLOAD_NAME_FILENAME), downloadFilename);

    const timer = setTimeout(() => {
      void purgeJob(jobId);
    }, DECRYPT_FILE_TTL_MS);

    downloads.set(jobId, { outputPath, jobDir, timer, downloadFilename });

    const expiresAt = new Date(expireAt).toISOString();
    return Response.json({
      downloadUrl: `/api/decrypt/download/${jobId}`,
      expiresAt,
      retentionMinutes: 15,
    });
  } catch (e) {
    if (jobDir) await rm(jobDir, { recursive: true, force: true });
    console.error("decrypt error", e);
    return Response.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function getDecryptDownload(req: Request & { params: { token: string } }): Promise<Response> {
  const token = req.params.token;
  if (!JOB_ID_RE.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  let rec = downloads.get(token) ?? (await rehydrateDownloadRecord(token));
  if (!rec) {
    return new Response("Download link expired or invalid.", { status: 404 });
  }

  const f = Bun.file(rec.outputPath);
  if (!(await f.exists())) {
    await purgeJob(token);
    return new Response("File no longer available.", { status: 404 });
  }

  return new Response(f, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(rec.downloadFilename),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
