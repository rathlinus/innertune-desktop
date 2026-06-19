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

import { app, BrowserWindow, shell, session, ipcMain } from "electron";
import path from "node:path";
import os from "node:os";
import { startServer, type ServeHandle } from "../server/serve";
import { attachTaskbar } from "./taskbar";
import { attachTray, type TrayHandle } from "./tray";
import { loadWindowState, manageWindowState } from "./window-state";
import { DiscordPresence, type PlaybackInfo } from "./discord";

let serveHandle: ServeHandle | null = null;
let win: BrowserWindow | null = null;
let tray: TrayHandle | null = null;
let discord: DiscordPresence | null = null;
// Set the moment we genuinely want to exit (tray Quit / OS shutdown), so the
// window's close handler knows to actually close instead of hiding to tray.
let isQuitting = false;

// Mica (the Windows 11 translucent window material) only exists on Win11
// (build >= 22000); on Win10 the flag is ignored, so we don't bother making the
// chrome translucent there. os.release() is "10.0.<build>".
function isWindows11(): boolean {
  if (process.platform !== "win32") return false;
  return Number(os.release().split(".")[2] ?? 0) >= 22000;
}

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

  // Native window-control overlay: a hidden title bar with the OS min/max/close
  // buttons drawn over our own chrome, so the top bar reads as part of the app
  // (and Snap Layouts still work). Windows-only — Linux has no overlay, so we
  // keep its normal frame + system decorations. Mica makes the translucent
  // chrome tint with the desktop wallpaper (Win11). The renderer learns both
  // facts from process.argv via the preload (see preload.cjs).
  const useOverlay = process.platform === "win32";
  const useMica = isWindows11();
  const state = loadWindowState();

  // An autostart login passes --hidden (see setAutostart): come up parked in the
  // tray rather than flashing a window onto the user's freshly-loaded desktop.
  const startHidden = process.argv.includes("--hidden");

  win = new BrowserWindow({
    show: !startHidden,
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 940,
    minHeight: 600,
    // Transparent background lets the Mica material show through; opaque
    // elsewhere to avoid a load flash.
    backgroundColor: useMica ? "#00000000" : "#0f0f0f",
    backgroundMaterial: useMica ? "mica" : "none",
    autoHideMenuBar: true,
    title: "Innertune",
    icon: iconFile(),
    ...(useOverlay
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: { color: "#00000000", symbolColor: "#ffffff", height: 64 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        ...(useOverlay ? ["--ytm-overlay"] : []),
        ...(useMica ? ["--ytm-mica"] : []),
      ],
    },
  });

  if (state.maximized) win.maximize();
  manageWindowState(win);

  // Wire the Windows taskbar (thumbnail toolbar buttons + progress bar) to the
  // renderer's playback state. No-op on other platforms.
  attachTaskbar(win);

  // System tray: lets playback keep running with the window "closed", and drives
  // transport without raising the app. The same control channel as the taskbar.
  tray = attachTray(win, {
    iconPath: iconFile(),
    onControl: (action) => sendControl(action),
    onQuit: quitApp,
  });

  // Closing the window hides it to the tray instead of quitting, so music keeps
  // playing. A real exit goes through quitApp() / before-quit, which sets the
  // flag below. macOS keeps its own app-stays-running convention.
  win.on("close", (e) => {
    if (!isQuitting && process.platform !== "darwin") {
      e.preventDefault();
      win?.hide();
    }
  });

  // Fan the renderer's playback snapshots out to the tray (now-playing label +
  // play/pause state) and Discord Rich Presence. The taskbar has its own
  // listener on the same channel; multiple listeners coexist fine.
  ipcMain.on("playback:update", (e, snapshot: PlaybackInfo) => {
    if (!win || e.sender !== win.webContents) return;
    tray?.update(snapshot);
    discord?.update(snapshot);
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

// Register/unregister the OS "launch at login" item. Electron's login-item API
// is Windows + macOS only (the Linux AppImage has no install location for the
// system to autostart, so we no-op there — the renderer hides the toggle to
// match). We start hidden so an autostart login quietly parks the app in the
// tray instead of popping a window: macOS gets openAsHidden, Windows gets our
// own --hidden flag (read back in createWindow).
function setAutostart(enabled: boolean): void {
  if (process.platform === "linux") return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ["--hidden"],
  });
}

function sendControl(action: string): void {
  if (win && !win.isDestroyed()) win.webContents.send("playback:control", action);
}

// A genuine exit (tray "Quit"): flip the flag so the window's close handler
// stops hiding-to-tray, then quit. before-quit also sets it, covering OS-level
// shutdown / Cmd-Q.
function quitApp(): void {
  isQuitting = true;
  app.quit();
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
    // A plain relaunch: surface the existing window (it may be hidden in the
    // tray, so show() as well as restore/focus).
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
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

    // Renderer-driven "launch at login" toggle (Settings). App.tsx pushes the
    // stored preference here on startup and on every change, keeping the OS
    // login item in sync with the in-app setting.
    ipcMain.on("app:set-autostart", (_e, enabled: boolean) => setAutostart(!!enabled));

    // Discord Rich Presence. A no-op unless a client id is configured (see
    // electron/discord.ts); reconnects quietly if Discord isn't running yet.
    discord = new DiscordPresence();
    discord.start();

    void createWindow();

    app.on("activate", () => {
      if (win) {
        win.show();
        win.focus();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });

  // With hide-to-tray the window is never the last one closed during normal use,
  // so this mainly covers a real teardown. Keep playback alive on macOS.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    discord?.destroy();
    void serveHandle?.close();
  });
}
