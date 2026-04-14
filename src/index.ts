import { serve } from "bun";

import index from "@/client/index.html";
import { getDecryptDownload, postDecrypt, startDecryptJobCleanup } from "./server/decrypt-api";

startDecryptJobCleanup();

const parsedPort = Number(process.env.PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

const isProd = process.env.NODE_ENV === "production";

async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const file = Bun.file(`dist${url.pathname}`);
  if (await file.exists()) {
    return new Response(file);
  }
  return new Response(Bun.file("dist/index.html"), {
    headers: { "Content-Type": "text/html" },
  });
}

const server = serve({
  port,

  routes: {
    // Serve pre-built dist/ in production, or bundle from source in development.
    "/*": isProd ? serveStatic : index,

    "/api/decrypt": {
      POST: postDecrypt,
    },

    "/api/decrypt/download/:token": getDecryptDownload,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
