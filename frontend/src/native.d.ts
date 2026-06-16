// The `window.native` bridge exposed by the Electron preload (electron/preload.ts).
// Undefined when running in a plain browser (dev in a tab), so always guard.

export type NativeControl = "play" | "pause" | "playpause" | "next" | "previous";

export interface NativePlayback {
  hasTrack: boolean;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds
}

export interface NativeBridge {
  isDesktop: boolean;
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
