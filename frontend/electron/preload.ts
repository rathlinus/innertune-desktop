// Preload bridge for the native desktop shell.
//
// contextIsolation is on (main.ts), so the renderer can't touch ipcRenderer
// directly. This exposes a tiny, typed `window.native` surface instead:
//   - updatePlayback: renderer -> main, pushes the current playback snapshot so
//     the main process can drive the Windows taskbar (thumbnail toolbar buttons
//     + the taskbar progress bar). See electron/taskbar.ts.
//   - onControl:      main -> renderer, delivers clicks from those taskbar
//     buttons back to the player. Returns an unsubscribe.
//
// The Windows now-playing flyout (SMTC) and hardware media keys are handled
// entirely in the renderer via the MediaSession API (see src/useNativeMedia.ts)
// and don't pass through here.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type NativeControl = "play" | "pause" | "playpause" | "next" | "previous";

interface Playback {
  hasTrack: boolean;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds
}

contextBridge.exposeInMainWorld("native", {
  isDesktop: true,
  updatePlayback: (state: Playback) => ipcRenderer.send("playback:update", state),
  onControl: (cb: (action: NativeControl) => void) => {
    const listener = (_e: IpcRendererEvent, action: NativeControl) => cb(action);
    ipcRenderer.on("playback:control", listener);
    return () => ipcRenderer.removeListener("playback:control", listener);
  },
});
