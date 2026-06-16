// Taskbar / launcher integration driven by the renderer's playback state.
//
// Two surfaces, with different platform reach:
//   - Thumbnail toolbar buttons (prev / play-pause / next on the taskbar hover
//     preview) — Windows only; setThumbarButtons is a no-op elsewhere.
//   - Progress bar on the taskbar/launcher icon — Windows AND the Linux (Unity)
//     launcher both honour setProgressBar, so we drive it on both.
//
// The renderer streams snapshots over IPC ("playback:update", see preload.ts);
// button clicks go back as "playback:control". On Linux the now-playing
// metadata + controls come from MPRIS instead (Chromium maps the renderer's
// MediaSession onto it automatically — see src/useNativeMedia.ts), so this
// module only adds the launcher progress bar there.

import { ipcMain, type BrowserWindow } from "electron";
import { thumbarIcons } from "./thumbar-icons";

interface Playback {
  hasTrack: boolean;
  isPlaying: boolean;
  position: number;
  duration: number;
}

export function attachTaskbar(win: BrowserWindow): void {
  const isWin = process.platform === "win32";
  // Thumbnail toolbar icons exist only on Windows; skip the (no-op) work
  // elsewhere.
  const icons = isWin ? thumbarIcons() : null;

  const send = (action: string) => {
    if (!win.isDestroyed()) win.webContents.send("playback:control", action);
  };

  const buttons = (s: Playback) =>
    !s.hasTrack || !icons
      ? []
      : [
          { icon: icons.prev, tooltip: "Previous", click: () => send("previous") },
          s.isPlaying
            ? { icon: icons.pause, tooltip: "Pause", click: () => send("pause") }
            : { icon: icons.play, tooltip: "Play", click: () => send("play") },
          { icon: icons.next, tooltip: "Next", click: () => send("next") },
        ];

  let last: Playback | null = null;

  const apply = (s: Playback) => {
    // Windows: rebuild the toolbar only when its buttons would actually change
    // (track presence or play/pause state) — not on every position tick.
    if (icons && (!last || last.hasTrack !== s.hasTrack || last.isPlaying !== s.isPlaying)) {
      win.setThumbarButtons(buttons(s));
    }
    // Progress bar (Windows + Linux launcher): -1 removes it; "paused" tints the
    // same fill. Cheap to call every tick.
    if (!s.hasTrack || s.duration <= 0) {
      win.setProgressBar(-1);
    } else {
      win.setProgressBar(Math.min(1, s.position / s.duration), {
        mode: s.isPlaying ? "normal" : "paused",
      });
    }
    last = s;
  };

  const onUpdate = (e: Electron.IpcMainEvent, s: Playback) => {
    if (e.sender === win.webContents) apply(s);
  };
  ipcMain.on("playback:update", onUpdate);
  win.on("closed", () => ipcMain.removeListener("playback:update", onUpdate));

  // Windows: start with an empty toolbar; buttons appear once a track loads.
  if (icons) win.setThumbarButtons([]);
}
