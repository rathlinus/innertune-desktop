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

import { app, BrowserWindow, shell, session } from "electron";
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

// YT Music's image CDNs (lh3.googleusercontent.com, i.ytimg.com, *.ggpht.com)
// hand anonymous, no-referer requests a much tighter rate-limit bucket than
// first-party traffic from music.youtube.com — which is why album art here can
// sporadically 429 while the real site never does. The renderer can't forge a
// cross-origin Referer on <img> loads (the browser owns that header), but the
// main process can rewrite outgoing headers, so we make every art request look
// like it came from music.youtube.com. We don't add an Origin header: a real
// <img> GET from the site doesn't send one either, so doing so would look less
// first-party (and could trip CORS handling), not more.
function spoofImageReferer(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.googleusercontent.com/*", "*://*.ytimg.com/*", "*://*.ggpht.com/*"] },
    (details, cb) => {
      details.requestHeaders["Referer"] = "https://music.youtube.com/";
      cb({ requestHeaders: details.requestHeaders });
    }
  );
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

  spoofImageReferer();
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
