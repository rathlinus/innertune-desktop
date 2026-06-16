// Standalone production server — the entry point compiled into the single-file
// release binary (see scripts/build-exe.mjs).
//
// In dev the app runs through Vite (apiPlugin middleware in api.ts). There is no
// Vite at runtime in a packaged build, so this is a tiny dependency-free HTTP
// server that does the two things Vite was doing for us:
//
//   1. routes /api/* to the exact same `handle()` used by the dev middleware, and
//   2. serves the built React SPA (index.html + assets), with a route fallback.
//
// The SPA files are pulled from the Single Executable Application asset store
// when running as a packaged binary (node:sea), and from ./dist on disk when run
// as plain `node build/bundle.cjs` for local testing.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import * as sea from "node:sea";
import { handle } from "./api";

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";
const DIST_DIR = process.env.YTM_DIST || path.join(process.cwd(), "dist");

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
// Embedded assets first (packaged binary), then disk (local run); null = miss.
function loadAsset(key: string): Buffer | null {
  if (inSea()) {
    try {
      return Buffer.from(sea.getAsset(key));
    } catch {
      return null;
    }
  }
  const fp = path.join(DIST_DIR, key);
  if (fp.startsWith(DIST_DIR) && existsSync(fp)) {
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

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || "/", "http://localhost");
  const key = keyFor(url.pathname);

  let body = loadAsset(key);
  let served = key;
  // SPA fallback: client-side routes (no file extension) get index.html.
  if (!body && !path.extname(key)) {
    body = loadAsset("index.html");
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

function openBrowser(url: string): void {
  if (process.env.YTM_NO_OPEN) return;
  try {
    const [cmd, args]: [string, string[]] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening a browser is best-effort */
  }
}

const server = createServer((req, res) => {
  // The API handler claims /api/* (and writes its own response); anything it
  // doesn't handle falls through to the static SPA.
  handle(req, res)
    .then((handled) => {
      if (!handled) serveStatic(req, res);
    })
    .catch((e) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ detail: String(e) }));
    });
});

server.listen(PORT, HOST, () => {
  const link = `http://${HOST}:${PORT}`;
  console.log(`ytmusicnative is running at ${link}`);
  console.log("Press Ctrl+C to stop.");
  openBrowser(link);
});
