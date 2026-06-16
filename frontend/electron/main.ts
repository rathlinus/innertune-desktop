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
import { attachTaskbar } from "./taskbar";

let serveHandle: ServeHandle | null = null;
let win: BrowserWindow | null = null;

// The built SPA: bundled alongside the app in production, on disk in dev.
function distDir(): string {
  return app.isPackaged
    ? path.join(app.getAppPath(), "dist")
    : path.join(__dirname, "..", "..", "dist");
}

// The YouTube Music app icon. On Windows the packaged .exe already carries the
// embedded icon (electron-builder win.icon), but setting it on the window keeps
// the taskbar/title-bar icon correct in dev and is required for the Linux
// AppImage window. Shipped via electron-builder extraResources in production,
// read straight from build-resources/ in dev.
function iconFile(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "..", "build-resources", "icon.png");
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
    icon: iconFile(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Wire the Windows taskbar (thumbnail toolbar buttons + progress bar) to the
  // renderer's playback state. No-op on other platforms.
  attachTaskbar(win);

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

// Transport commands accepted on the command line, e.g. `innertune --next`.
// Handy on Linux for binding desktop/global shortcuts to a single AppImage (the
// flag is forwarded to the already-running instance below); harmless elsewhere.
const CONTROL_ARGS: Record<string, string> = {
  "--play-pause": "playpause",
  "--play": "play",
  "--pause": "pause",
  "--next": "next",
  "--previous": "previous",
  "--prev": "previous",
};

function controlFromArgv(argv: string[]): string | null {
  for (const a of argv) if (Object.hasOwn(CONTROL_ARGS, a)) return CONTROL_ARGS[a];
  return null;
}

function sendControl(action: string): void {
  if (win && !win.isDestroyed()) win.webContents.send("playback:control", action);
}

// Single-instance: a second launch (e.g. clicking the icon again, or a shortcut
// bound to `--next`) hands its argv to the running instance instead of opening a
// duplicate window — which would mean two players fighting over playback.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const action = controlFromArgv(argv);
    if (action) {
      sendControl(action);
      return;
    }
    // A plain relaunch: surface the existing window.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // Make Windows group the window/notifications under our own identity (and so
    // pick up the app icon) instead of the generic Electron one.
    if (process.platform === "win32") app.setAppUserModelId("com.rathlinus.innertune");

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
}
