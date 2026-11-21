import { ChevronRight, ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { IJG_ACKNOWLEDGEMENT, parseThirdPartyNotices } from "@/lib/third-party-notices";
// The package's `exports` block subpath imports, so the file is reached by path. Bundled into this chunk (precached).
import noticesMarkdown from "../../node_modules/@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md?raw";
import qpdfWasmLicense from "../../node_modules/@mssio/qpdf-wasm/LICENSE?raw";
import appLicense from "../../LICENSE?raw";

const LIBRARIES = parseThirdPartyNotices(noticesMarkdown);

const REPOS = [
  {
    name: "PDF Toolbox",
    href: "https://github.com/mssio/pdf-mss-io",
    license: "MIT",
    licenseText: appLicense,
    description: "This app.",
  },
  {
    name: "qpdf-wasm",
    href: "https://github.com/mssio/qpdf-wasm",
    license: "Apache-2.0",
    licenseText: qpdfWasmLicense,
    description: "The PDF engine: qpdf compiled to WebAssembly.",
  },
];

const FOCUS_RING = "rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline", FOCUS_RING, className)}
    >
      {children}
      <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** A closed-by-default license text; screen readers hear which software it belongs to. */
function LicenseDetails({ title, owner, text }: { title: string; owner: string; text: string }) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
        {title}
        <span className="sr-only"> for {owner}</span>
      </summary>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words text-foreground">
        {text.trim()}
      </pre>
    </details>
  );
}

/** /about: why the code is public, where it lives, and the licenses of the software inside the PDF engine. */
export function Component() {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold">About PDF Toolbox</h1>
          <CardDescription className="text-pretty">
            PDF Toolbox runs entirely in your browser. Your files and passwords never leave your device. The code is
            open source (MIT), so anyone can check.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Source code</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <ul className="grid grid-cols-1 gap-3">
            {REPOS.map((repo) => (
              <li key={repo.href} className="grid grid-cols-1 gap-0.5">
                <div className="flex flex-wrap items-center gap-x-2">
                  <ExternalLink href={repo.href} className="font-medium">
                    {repo.name}
                  </ExternalLink>
                  <Badge variant="secondary">{repo.license}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{repo.description}</p>
                <LicenseDetails title="License" owner={repo.name} text={repo.licenseText} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Credits</h2>
          </CardTitle>
          <CardDescription>The PDF engine is built from this software:</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6">
          <p className="text-sm">{IJG_ACKNOWLEDGEMENT}</p>
          {LIBRARIES.map((library) => (
            <section key={library.name} className="grid grid-cols-1 gap-1.5">
              <h3 className="text-sm font-semibold break-words">{library.name}</h3>
              {library.sourceUrl ? (
                <div>
                  <ExternalLink href={library.sourceUrl} className="w-fit text-sm break-all">
                    {library.sourceUrl}
                  </ExternalLink>
                  {library.sourceDetail ? (
                    <p className="text-sm text-muted-foreground">Source: {library.sourceDetail}</p>
                  ) : null}
                </div>
              ) : null}
              {library.notes.map((note, index) => (
                <p key={index} className="text-sm text-muted-foreground">
                  {note}
                </p>
              ))}
              {library.licenses.map((license, index) => (
                <LicenseDetails key={index} title={license.title ?? "License"} owner={library.name} text={license.text} />
              ))}
            </section>
          ))}
        </CardContent>
      </Card>

      <div>
        <Button className="w-full sm:w-auto" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
