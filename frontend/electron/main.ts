// Electron main process.
//
// The app is the same React SPA + youtubei API that runs in the browser, only
// rendered in a native window instead of a browser tab. We keep the existing
// same-origin model intact: a tiny localhost HTTP server (server/serve.ts)
// serves the built SPA and routes /api/* to the very same handler the Vite dev
// middleware uses, and the BrowserWindow just loads that URL. That means audio
// streaming (Range requests against /api/stream) and every fetch keep working
// untouched — no CORS, no file:// quirks.
//
// In dev, YTM_DEV_SERVER points at the running Vite server (which already hosts
// the API middleware), so we skip the embedded server and load that instead.

import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { startServer, type ServeHandle } from "../server/serve";

let serveHandle: ServeHandle | null = null;
let win: BrowserWindow | null = null;

// The built SPA: bundled alongside the app in production, on disk in dev.
function distDir(): string {
  return app.isPackaged
    ? path.join(app.getAppPath(), "dist")
    : path.join(__dirname, "..", "..", "dist");
}

async function resolveUrl(): Promise<string> {
  const devServer = process.env.YTM_DEV_SERVER;
  if (devServer) return devServer;
  serveHandle = await startServer({ host: "127.0.0.1", port: 0, distDir: distDir() });
  return serveHandle.url;
}

async function createWindow(): Promise<void> {
  const url = await resolveUrl();

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: true,
    title: "Innertune",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep in-app navigation in the window; send real external links (e.g. the
  // login flow's "open in browser") to the system browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });

  await win.loadURL(url);
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  // Captured session/cookies must live somewhere writable in a packaged app.
  process.env.YTM_DATA ||= path.join(app.getPath("userData"), "data");

  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void serveHandle?.close();
});
