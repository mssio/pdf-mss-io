import { createBrowserRouter } from "react-router";

import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { HomePage } from "@/pages/HomePage";
import { tools } from "@/tools";

// ErrorBoundary sits on each child: a boundary on the layout route would replace AppShell itself.
export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      { path: "/", Component: HomePage, ErrorBoundary: RouteError },
      ...tools.map((tool) => ({ path: tool.path, lazy: tool.load, ErrorBoundary: RouteError })),
    ],
  },
]);
