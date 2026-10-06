import { FileKey2, FileLock2, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

export type Tool = {
  id: string;
  path: string;
  /** Page and card title, e.g. "Decrypt PDF". */
  title: string;
  /** Short header link label, e.g. "Decrypt". */
  navLabel: string;
  description: string;
  icon: LucideIcon;
  /** Lazy page module; it must export `Component`. */
  load: () => Promise<{ Component: ComponentType }>;
};

/** Every tool, in display order. Drives the header nav, the home grid and the routes. */
export const tools: Tool[] = [
  {
    id: "decrypt",
    path: "/decrypt",
    title: "Decrypt PDF",
    navLabel: "Decrypt",
    description: "Remove password protection from a PDF, right in your browser with qpdf.",
    icon: FileKey2,
    load: () => import("@/pages/DecryptPage"),
  },
  {
    id: "encrypt",
    path: "/encrypt",
    title: "Encrypt PDF",
    navLabel: "Encrypt",
    description: "Add a password and choose permissions for printing, editing and copying.",
    icon: FileLock2,
    load: () => import("@/pages/EncryptPage"),
  },
];
