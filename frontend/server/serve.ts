// Shared production HTTP server.
//
// In dev the app runs through Vite (apiPlugin middleware in api.ts). There is no
// Vite at runtime in a packaged build, so this is a tiny dependency-free HTTP
// server that does the two things Vite was doing for us:
//
//   1. routes /api/* to the exact same `handle()` used by the dev middleware, and
//   2. serves the built React SPA (index.html + assets), with a route fallback.
//
// Both entry points reuse it: the Electron main process (electron/main.ts) calls
// startServer() and points a BrowserWindow at the returned URL, and the CLI
// binary (server/standalone.ts) calls it and opens a browser. The SPA files come
// from the Single Executable Application asset store when running as a packaged
// node:sea binary, and from a dist/ folder on disk otherwise.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import * as sea from "node:sea";
import { handle } from "./api";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function inSea(): boolean {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}

// Load a built asset by its dist-relative key ("index.html", "assets/x.js").
// Embedded assets first (packaged binary), then disk (Electron / local run);
// null = miss.
function loadAsset(distDir: string, key: string): Buffer | null {
  if (inSea()) {
    try {
      return Buffer.from(sea.getAsset(key));
    } catch {
      return null;
    }
  }
  const fp = path.join(distDir, key);
  if (fp.startsWith(distDir) && existsSync(fp)) {
    try {
      return readFileSync(fp);
    } catch {
      return null;
    }
  }
  return null;
}

function keyFor(pathname: string): string {
  let p = decodeURIComponent(pathname);
  if (p.endsWith("/")) p += "index.html";
  return p.replace(/^\/+/, "");
}

function serveStatic(distDir: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || "/", "http://localhost");
  const key = keyFor(url.pathname);

  let body = loadAsset(distDir, key);
  let served = key;
  // SPA fallback: client-side routes (no file extension) get index.html.
  if (!body && !path.extname(key)) {
    body = loadAsset(distDir, "index.html");
    served = "index.html";
  }
  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = CONTENT_TYPES[path.extname(served)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control":
      served === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });
  res.end(body);
}

export interface ServeOptions {
  /** Port to listen on; 0 (the default) picks a free ephemeral port. */
  port?: number;
  host?: string;
  /** Where the built SPA lives on disk (ignored when running as a SEA binary). */
  distDir?: string;
}

export interface ServeHandle {
  url: string;
  port: number;
  host: string;
  server: Server;
  close: () => Promise<void>;
}

// Start the API + static server and resolve once it is listening.
export function startServer(opts: ServeOptions = {}): Promise<ServeHandle> {
  const host = opts.host || process.env.HOST || "127.0.0.1";
  const port = opts.port ?? (Number(process.env.PORT) || 0);
  const distDir =
    opts.distDir || process.env.YTM_DIST || path.join(process.cwd(), "dist");

  const server = createServer((req, res) => {
    // The API handler claims /api/* (and writes its own response); anything it
    // doesn't handle falls through to the static SPA.
    handle(req, res)
      .then((handled) => {
        if (!handled) serveStatic(distDir, req, res);
      })
      .catch((e) => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ detail: String(e) }));
      });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        host,
        server,
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
