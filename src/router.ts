import { createBrowserRouter } from "react-router";

import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { tools } from "@/tools";

// The error boundary lives on a pathless route inside AppShell: it catches failures from every page,
// including a lazy page whose code fails to load, while the shell's header and footer stay visible.
export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      {
        ErrorBoundary: RouteError,
        children: [
          { path: "/", Component: HomePage },
          ...tools.map((tool) => ({ path: tool.path, lazy: tool.load })),
          { path: "/install/:step?", lazy: () => import("@/pages/InstallPage") },
          { path: "/offline", lazy: () => import("@/pages/OfflinePage") },
          { path: "*", Component: NotFoundPage },
        ],
      },
    ],
  },
]);
