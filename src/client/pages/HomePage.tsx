import { FileKey2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-12 text-center sm:mb-16">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          Privacy-focused PDF utilities
        </div>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Your PDF toolbox</h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          Simple, focused tools for everyday PDF tasks. Start with decrypt—more utilities will land here over time.
        </p>
      </div>

      <div className="mx-auto grid max-w-lg gap-6 sm:max-w-none sm:grid-cols-2">
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-muted/30 shadow-md transition-shadow hover:shadow-lg">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileKey2 className="size-6" />
            </div>
            <CardTitle>PDF decrypt</CardTitle>
            <CardDescription>
              Remove password protection from a PDF you can open with <code className="text-foreground">qpdf</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/decrypt">Open tool</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-dashed opacity-80">
          <CardHeader>
            <CardTitle className="text-muted-foreground">More soon</CardTitle>
            <CardDescription>Merge, split, and compress are on the roadmap.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
