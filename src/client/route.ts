import { createBrowserRouter } from "react-router";

import { AppShell } from "@/client/components/AppShell";
import { DecryptPage } from "@/client/pages/DecryptPage";
import { HomePage } from "@/client/pages/HomePage";

const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      { path: "/", Component: HomePage },
      { path: "/decrypt", Component: DecryptPage },
    ],
  },
]);

export default router;
