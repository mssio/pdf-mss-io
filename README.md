# PDF Toolbox (Bun + React + Tailwind + shadcn-style UI)

Small fullstack app: **home** (`/`) lists PDF tools; **decrypt** (`/decrypt`) uploads a password-protected PDF and returns a short-lived download link after `qpdf --decrypt`.

## Setup

```bash
bun install
```

Install **qpdf** on the machine (not vendored in this repo):

- macOS: `brew install qpdf`
- Debian/Ubuntu: `sudo apt-get install -y qpdf`

Optional: set **`QPDF_PATH`** or **`QPDF_BIN`** to the full path of the `qpdf` binary if it is not on `PATH`.

## Run

```bash
bun dev
```

Production-style:

```bash
bun start
```

`PORT` defaults to `3000`; override with `PORT=8080 bun start`.

## Configuration

| Variable    | Purpose |
|------------|---------|
| `PORT`     | HTTP port (default `3000`). |
| `TMP_DIR`  | Directory for temporary decrypt jobs (default `./data/tmp`, gitignored). |
| `QPDF_PATH` / `QPDF_BIN` | Path to `qpdf` if not on `PATH`. |

Decrypted files are deleted **15 minutes** after a successful decrypt (see UI copy on `/decrypt`). The server uses a **per-job timer** plus a **`Bun.cron` sweep every 5 minutes** that reads `.expire` markers under `TMP_DIR`/`data/tmp`, so restarts and orphaned job folders are cleaned up even if an in-memory timer is lost.

## Static client build

```bash
bun run build
```

Emits browser bundles for `src/client/**/*.html` (single SPA shell: [`index.html`](src/client/index.html); routes use React Router).

This project was created using `bun init` in bun v1.3.12. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
