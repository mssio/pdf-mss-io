import { Link, Outlet } from "react-router-dom";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/client/components/ui/button";
import { useTheme } from "@/client/lib/use-theme";
import { cn } from "@/client/lib/utils";

type AppShellProps = {
  /** Optional wrapper classes on `<main>`. */
  mainClassName?: string;
};

export function AppShell({ mainClassName }: AppShellProps) {
  const { mode, toggle } = useTheme();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm">
              PDF
            </span>
            <span className="hidden sm:inline">Toolbox</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Home</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/decrypt">Decrypt</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={toggle}
              aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </nav>
        </div>
      </header>
      <main className={cn("flex-1", mainClassName)}>
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        PDFs are processed on this server. Decrypted downloads expire after 15 minutes.
      </footer>
    </div>
  );
}
