import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Decrypted files are removed after this interval. */
export const DECRYPT_FILE_TTL_MS = 15 * 60 * 1000;

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const EXPIRE_FILENAME = ".expire";
const CREATED_FILENAME = ".created";
/** Job dirs with `.created` but no `.expire` (crash / failed run) are removed after this age. */
const ORPHAN_NO_EXPIRE_MS = 2 * 60 * 60 * 1000;
/** Hex-only dirs with no marker files (legacy) are removed if older than this by mtime. */
const LEGACY_DIR_MAX_MS = 24 * 60 * 60 * 1000;

const JOB_ID_RE = /^[a-f0-9]{48}$/;

function jobsBaseDir(): string {
  return process.env.TMP_DIR?.trim() || path.join(process.cwd(), "data", "tmp");
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
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const jobId = ent.name;
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
  void sweepExpiredJobDirs();

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

    const form = await req.formData();
    const file = form.get("file");
    const password = form.get("password");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Please upload a PDF file." }, { status: 400 });
    }
    if (typeof password !== "string" || !password) {
      return Response.json({ error: "Password is required." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
      return Response.json({ error: "File must be a PDF." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` },
        { status: 400 },
      );
    }

    const jobId = randomBytes(24).toString("hex");
    const base = jobsBaseDir();
    jobDir = path.join(base, jobId);
    await mkdir(jobDir, { recursive: true });
    await Bun.write(path.join(jobDir, CREATED_FILENAME), String(Date.now()));

    const inputPath = path.join(jobDir, "input.pdf");
    const outputPath = path.join(jobDir, "decrypted.pdf");

    await Bun.write(inputPath, file);

    const qpdf = qpdfExecutable();
    const proc = Bun.spawn([qpdf, `--password=${password}`, "--decrypt", inputPath, outputPath], {
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

    const downloadFilename = decryptedDownloadFilename(file.name);
    const expireAt = Date.now() + DECRYPT_FILE_TTL_MS;
    await Bun.write(path.join(jobDir, EXPIRE_FILENAME), String(expireAt));

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

  const rec = downloads.get(token);
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
    },
  });
}
