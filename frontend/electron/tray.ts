// System-tray presence + transport menu.
//
// A music player is expected to keep running when its window is "closed", so
// main.ts turns the window's close into a hide and this tray is how you get it
// back (left-click) or drive playback without raising it (context menu). The
// menu mirrors the live playback snapshot the renderer streams over IPC
// (title/artist + the play/pause label), reusing the exact same control channel
// as the taskbar buttons.

import { Menu, Tray, nativeImage, type BrowserWindow } from "electron";

interface Playback {
  hasTrack: boolean;
  isPlaying: boolean;
  title?: string;
  artist?: string;
}

type Control = "play" | "pause" | "next" | "previous";

interface Options {
  iconPath: string;
  onControl: (action: Control) => void;
  onQuit: () => void;
}

export interface TrayHandle {
  update(state: Playback): void;
  destroy(): void;
}

function nowPlayingLabel(s: Playback): string {
  if (!s.hasTrack || !s.title) return "Nothing playing";
  const line = s.artist ? `${s.title} — ${s.artist}` : s.title;
  return line.length > 80 ? line.slice(0, 79) + "…" : line;
}

export function attachTray(win: BrowserWindow, opts: Options): TrayHandle {
  // The packaged icon is a large PNG; the tray wants ~16px on Windows.
  const base = nativeImage.createFromPath(opts.iconPath);
  const icon = process.platform === "win32" && !base.isEmpty()
    ? base.resize({ width: 16, height: 16 })
    : base;
  const tray = new Tray(icon);

  const show = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const menu = (s: Playback) =>
    Menu.buildFromTemplate([
      { label: nowPlayingLabel(s), enabled: false },
      { type: "separator" },
      {
        label: s.isPlaying ? "Pause" : "Play",
        enabled: s.hasTrack,
        click: () => opts.onControl(s.isPlaying ? "pause" : "play"),
      },
      { label: "Next", enabled: s.hasTrack, click: () => opts.onControl("next") },
      { label: "Previous", enabled: s.hasTrack, click: () => opts.onControl("previous") },
      { type: "separator" },
      { label: "Show Innertune", click: show },
      { label: "Quit", click: opts.onQuit },
    ]);

  const empty: Playback = { hasTrack: false, isPlaying: false };
  tray.setToolTip("Innertune");
  tray.setContextMenu(menu(empty));
  // Windows: left-click raises the app (the context menu is right-click).
  tray.on("click", show);
  tray.on("double-click", show);

  let last: Playback | null = null;
  const labelFields = (s: Playback) =>
    `${s.hasTrack}|${s.isPlaying}|${s.title ?? ""}|${s.artist ?? ""}`;

  return {
    update(s) {
      // Rebuild only when something the menu/tooltip shows actually changed —
      // not on every per-second position tick.
      if (last && labelFields(last) === labelFields(s)) return;
      last = s;
      tray.setContextMenu(menu(s));
      tray.setToolTip(s.hasTrack && s.title ? nowPlayingLabel(s) : "Innertune");
    },
    destroy() {
      tray.destroy();
    },
  };
}
