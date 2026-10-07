import { fileURLToPath } from "node:url";

export const FIXTURES_DIR = fileURLToPath(new URL("./.fixtures/", import.meta.url));

export function fixture(name: string): string {
  return `${FIXTURES_DIR}${name}`;
}
