import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { useInstallBanner } from "@/lib/use-install-banner";

/** Phones only: offers adding the app to the home screen (spec section 10). */
export function InstallBanner() {
  const { kind, install, dismiss } = useInstallBanner();
  const { pathname } = useLocation();
  if (!kind || pathname.startsWith("/install")) return null;
  return (
    <div className="mx-auto max-w-lg px-4 pt-4 sm:px-6">
      <section
        aria-label="Install PDF Toolbox"
        className="grid gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-xs"
      >
        <p>
          <strong className="font-semibold">
            {kind === "android" ? "Install PDF Toolbox" : "Add PDF Toolbox to your Home Screen"}
          </strong>{" "}
          to open it like an app and use it offline.
        </p>
        <div className="flex gap-2">
          {kind === "android" ? (
            <Button size="sm" onClick={install}>
              Install
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to="/install">How</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </section>
    </div>
  );
}
