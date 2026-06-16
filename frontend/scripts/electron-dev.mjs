// Dev launcher: Vite dev server + Electron window (no browser).
//
//   1. esbuild electron/main.ts -> build/electron/main.cjs
//   2. start `vite` on 127.0.0.1:5173 (it already hosts the /api middleware)
//   3. wait for it to answer, then launch Electron pointed at it via
//      YTM_DEV_SERVER, so the main process loads the live dev URL instead of
//      starting its own server.
//
// Electron exiting tears the whole thing down.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(import.meta.url), "..", ".."); // frontend/
const isWin = process.platform === "win32";
const DEV_URL = "http://127.0.0.1:5173";

async function buildMain() {
  const { build } = await import("esbuild");
  const common = {
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["electron"],
  };
  const buildDir = path.join(root, "build", "electron");
  await Promise.all([
    build({ ...common, entryPoints: [path.join(root, "electron", "main.ts")], outfile: path.join(buildDir, "main.cjs") }),
    build({ ...common, entryPoints: [path.join(root, "electron", "preload.ts")], outfile: path.join(buildDir, "preload.cjs") }),
  ]);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite dev server never came up at ${url}`);
}

async function main() {
  console.log("Building Electron main...");
  await buildMain();

  console.log("Starting Vite dev server...");
  const npm = isWin ? "npm.cmd" : "npm";
  const vite = spawn(
    npm,
    ["run", "dev", "--", "--port", "5173", "--host", "127.0.0.1"],
    { cwd: root, stdio: "inherit", shell: isWin }
  );

  await waitForServer(DEV_URL);

  console.log("Launching Electron...");
  const electron = spawn(require("electron"), ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, YTM_DEV_SERVER: DEV_URL },
  });

  const shutdown = () => {
    try { vite.kill(); } catch { /* ignore */ }
    try { electron.kill(); } catch { /* ignore */ }
  };
  electron.on("exit", () => { shutdown(); process.exit(0); });
  process.on("SIGINT", () => { shutdown(); process.exit(0); });
  process.on("SIGTERM", () => { shutdown(); process.exit(0); });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
