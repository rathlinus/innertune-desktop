// Standalone CLI server — the entry point compiled into the single-file release
// binary (see scripts/build-exe.mjs). It boots the shared API + static server
// (server/serve.ts) and opens a browser at it.
//
// The desktop app uses Electron instead (electron/main.ts), which reuses the
// very same startServer() but renders the SPA in a native window. This binary
// stays around for a no-Electron, single-file run.

import { startServer } from "./serve";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";

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

startServer({ port: PORT, host: HOST }).then(({ url }) => {
  console.log(`ytmusicnative is running at ${url}`);
  console.log("Press Ctrl+C to stop.");
  openBrowser(url);
});
