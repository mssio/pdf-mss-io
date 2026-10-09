# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-09

### Added

- A progress bar while the PDF is being written (Decrypt, Encrypt, Merge, Extract pages, Compress),
  then "Finishing…" for the last checks.

### Changed

- A stuck PDF engine is detected sooner: once a job reports progress, it stops after 30 seconds
  without any.
- `@mssio/qpdf-wasm` 1.1.0 (same qpdf 12.4.2 and the same `qpdf.wasm`; it adds progress reporting).

## [1.0.0] - 2026-10-07

First release of the static, client-side PDF Toolbox (replaces the Bun server app).

### Added

- Decrypt, Encrypt, Merge, Extract pages, Compress and Info tools, all running in the browser with
  qpdf 12.4.2 compiled to WebAssembly (`@mssio/qpdf-wasm` 1.0.0).
- Installable PWA that works offline after the first visit; new versions are picked up after every
  tab of the app has been closed and it is opened again.
- While a job runs: its step and elapsed time; on the result page: how long it took.
- Safeguards for big files on phones: a notice when the browser reloads the page mid-job, and time
  limits that stop a stuck PDF engine with a clear message and start a fresh one.
- Password fields that browsers and password managers don't offer to save.
- 250 MB combined size limit per operation, on computers and phones.
- "Page not found" and "Something went wrong" screens inside the app's header and footer.
- App version in the footer.
- Playwright browser tests for every tool, offline use (Chromium and WebKit) and the app shell.

### Changed

- PDFs and passwords never leave the device; the server, upload limit and 15-minute download links
  are gone.

[1.0.0]: https://github.com/mssio/pdf-mss-io/releases/tag/v1.0.0
