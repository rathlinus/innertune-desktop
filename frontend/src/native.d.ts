// The `window.native` bridge exposed by the Electron preload (electron/preload.ts).
// Undefined when running in a plain browser (dev in a tab), so always guard.

export type NativeControl = "play" | "pause" | "playpause" | "next" | "previous";

export interface NativePlayback {
  hasTrack: boolean;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds
  title?: string;
  artist?: string;
  album?: string | null;
  artwork?: string | null;
}

export interface NativeBridge {
  isDesktop: boolean;
  /** process.platform of the host ("win32" | "linux" | "darwin"). */
  platform: string;
  /** True when the window uses a hidden title bar with the OS control overlay. */
  titleBarOverlay: boolean;
  /** True when the window uses the Windows 11 Mica material (translucent chrome). */
  mica: boolean;
  /** Push the current playback snapshot so the OS taskbar can reflect it. */
  updatePlayback(state: NativePlayback): void;
  /** Subscribe to control commands from native UI (taskbar buttons). Returns an unsubscribe. */
  onControl(cb: (action: NativeControl) => void): () => void;
}

declare global {
  interface Window {
    native?: NativeBridge;
  }
}
