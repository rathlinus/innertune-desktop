// Persist and restore the window's size / position / maximized state across
// launches — a small but conspicuous "installed app" behaviour Electron does
// not give you for free.
//
// State lives in a tiny JSON file in userData. On restore we sanity-check the
// saved bounds against the *current* display layout so a window saved on a
// monitor that's since been unplugged doesn't open off-screen.

import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT: WindowState = { width: 1280, height: 820, maximized: false };

function stateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

// A saved position is only usable if the window would land at least partly on
// some currently-connected display; otherwise we drop x/y and let Electron
// center it at the saved size.
function visibleOnSomeDisplay(b: Rectangle): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x < a.x + a.width &&
      b.x + b.width > a.x &&
      b.y < a.y + a.height &&
      b.y + b.height > a.y
    );
  });
}

export function loadWindowState(): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as Partial<WindowState>;
    if (typeof s.width !== "number" || typeof s.height !== "number") return { ...DEFAULT };
    const out: WindowState = {
      width: Math.max(DEFAULT.width / 2, Math.round(s.width)),
      height: Math.max(DEFAULT.height / 2, Math.round(s.height)),
      maximized: !!s.maximized,
    };
    if (typeof s.x === "number" && typeof s.y === "number") {
      const rect = { x: Math.round(s.x), y: Math.round(s.y), width: out.width, height: out.height };
      if (visibleOnSomeDisplay(rect)) {
        out.x = rect.x;
        out.y = rect.y;
      }
    }
    return out;
  } catch {
    // First run, or a corrupt file: fall back to the defaults.
    return { ...DEFAULT };
  }
}

// Attach save-on-change listeners. We persist getNormalBounds() (the restored,
// non-maximized rect) plus the maximized flag separately, so un-maximizing
// after a restart returns to the right size. Writes are debounced because
// resize/move fire in bursts while dragging.
export function manageWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;

  const save = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    const state: WindowState = {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      maximized: win.isMaximized(),
    };
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state));
    } catch {
      /* best-effort — losing the last window position is not worth crashing */
    }
  };

  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  };

  win.on("resize", debounced);
  win.on("move", debounced);
  win.on("maximize", debounced);
  win.on("unmaximize", debounced);
  // 'close' fires before the window is destroyed (even when we hide-to-tray and
  // later really quit), so this captures the final state.
  win.on("close", save);
}
