import { Moon, Sun } from "lucide-react";
import { Link, Outlet } from "react-router";

import { CrashNotice } from "@/components/CrashNotice";
import { UpdateDialog, UpdateFooterButton } from "@/components/UpdatePrompt";
import { Button } from "@/components/ui/button";
import { useAppUpdate } from "@/lib/use-app-update";
import { useTheme } from "@/lib/use-theme";
import { tools } from "@/tools";

export function AppShell() {
  const { mode, toggle } = useTheme();
  const update = useAppUpdate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <img src="/favicon.svg" alt="" width={32} height={32} className="size-8 rounded-lg dark:ring-1 dark:ring-border" />
            <span>PDF Toolbox</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Home</Link>
            </Button>
            <div className="hidden items-center gap-1 md:flex">
              {tools.map((tool) => (
                <Button key={tool.id} variant="ghost" size="sm" asChild>
                  <Link to={tool.path}>{tool.navLabel}</Link>
                </Button>
              ))}
            </div>
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
      <main className="flex-1">
        <CrashNotice />
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        PDFs are processed locally in your browser. Nothing is uploaded. · Version {__APP_VERSION__}
        {__APP_BUILD_LABEL__ ? ` · ${__APP_BUILD_LABEL__}` : null}
        {update.updateReady && !update.promptOpen ? (
          <UpdateFooterButton disabled={update.jobRunning} onUpdate={update.updateNow} />
        ) : null}
      </footer>
      <UpdateDialog open={update.promptOpen} onLater={update.later} onUpdate={update.updateNow} />
    </div>
  );
}
