import { createBrowserRouter } from "react-router";

import { AppShell } from "@/components/AppShell";
import { HomePage } from "@/pages/HomePage";
import { tools } from "@/tools";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [{ path: "/", Component: HomePage }, ...tools.map((tool) => ({ path: tool.path, lazy: tool.load }))],
  },
]);
