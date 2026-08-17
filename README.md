# PDF Toolbox (Bun + React + Tailwind + shadcn-style UI)

Fullstack **PDF toolbox**: **home** (`/`) lists tools; **decrypt** (`/decrypt`) accepts an encrypted PDF and password, runs **`qpdf --decrypt`** on the server, and returns a **time-limited download** link.

**Stack:** [Bun](https://bun.com) `serve()` + HTML entry ([`src/client/index.html`](src/client/index.html)), React 19, Tailwind 4, React Router (**[`createBrowserRouter`](src/client/route.ts)** + [`RouterProvider`](src/client/frontend.tsx)), UI primitives under [`src/client/components/ui/`](src/client/components/ui/).

## Setup

```bash
bun install
```

Install **qpdf** on the host (not committed to the repo):

- macOS: `brew install qpdf`
- Debian/Ubuntu: `sudo apt-get install -y qpdf`

Optional: **`QPDF_PATH`** or **`QPDF_BIN`** if `qpdf` is not on `PATH`.

## Run locally

```bash
bun dev
```

Production-style (same entry as Docker):

```bash
bun start
```

`PORT` defaults to `3000` (override: `PORT=8080 bun start`).

## Configuration

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3000`). |
| `TMP_DIR` | Temp decrypt job dirs (default `./data/tmp`, gitignored). |
| `QPDF_PATH` / `QPDF_BIN` | Absolute path to `qpdf` if needed. |

Decrypted outputs are removed **15 minutes** after success. A **per-job timer** plus **`Bun.cron` every 5 minutes** sweeps `.expire` files under the jobs directory so restarts do not leave stale dirs forever.

## Static client build

```bash
bun run build
```

Outputs browser assets under `dist/` from `src/client/**/*.html` (single shell HTML + bundled JS/CSS).

## Docker

The image installs **`qpdf` in the image** at build time and runs **`bun src/index.ts`** with `NODE_ENV=production`. Use [`.dockerignore`](.dockerignore) so host `node_modules` is not copied into the build context.

**Registry image name:** `registry.mss.io/pdf-mss-io`

### Build and push for **linux/amd64** (Buildx)

From the repository root (Apple Silicon or any host), build for AMD64 and push to your registry:

```bash
# One-time: ensure a buildx builder exists (optional if default works)
docker buildx create --name pdf-mss-io-builder --use 2>/dev/null || docker buildx use pdf-mss-io-builder
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64 \
  -t registry.mss.io/pdf-mss-io:latest \
  -t registry.mss.io/pdf-mss-io:1.0.0 \
  --push \
  .
```

Replace `latest` with a version tag (e.g. `1.0.0`) when you release.

**Notes:**

- **`--push`** publishes the image; **`--load`** only works when the image platform matches the host, so for **linux/amd64** from an ARM Mac you typically **push** (or use a registry as build cache).
- Log in first if the registry requires auth: `docker login registry.mss.io`

### Run the image

```bash
docker run --rm -p 3000:3000 registry.mss.io/pdf-mss-io:latest
```

Then open `http://localhost:3000`.

---

This project was created with `bun init` (bun v1.3.12).
