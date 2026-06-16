import { useEffect, useRef, type RefObject } from "react";
import type { Track } from "./types";

// OS media integration for the desktop shell, driven off the live <audio> state.
//
// MediaSession (renderer-side) is what surfaces the Windows now-playing flyout
// (SMTC) — title/artist/album art, the scrubber, and hardware media keys — with
// zero main-process involvement; Chromium maps it onto SMTC automatically. The
// Windows taskbar thumbnail buttons + progress bar live in the main process, so
// we also mirror state to it via window.native (electron/taskbar.ts) and accept
// its button clicks. Both no-op gracefully in a plain browser.

interface Controls {
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
}

interface Args {
  audioRef: RefObject<HTMLAudioElement | null>;
  current: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  controls: Controls;
}

const ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "previoustrack",
  "nexttrack",
  "seekto",
  "seekforward",
  "seekbackward",
];

export function useNativeMedia({ audioRef, current, isPlaying, position, duration, controls }: Args): void {
  // Keep the latest controls in a ref so the handlers we register once always
  // call current closures without re-subscribing. Updated post-render (the
  // handlers only read it later, on a key press / button click).
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  });

  // Register OS action handlers once: media keys + SMTC flyout buttons (via
  // MediaSession) and the Windows taskbar buttons (via window.native).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const resume = () => void audio.play().catch(() => {});
    const pause = () => audio.pause();

    const ms = navigator.mediaSession;
    if (ms) {
      ms.setActionHandler("play", resume);
      ms.setActionHandler("pause", pause);
      ms.setActionHandler("previoustrack", () => controlsRef.current.prev());
      ms.setActionHandler("nexttrack", () => controlsRef.current.next());
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) controlsRef.current.seek(d.seekTime);
      });
      ms.setActionHandler("seekforward", (d) =>
        controlsRef.current.seek(audio.currentTime + (d.seekOffset ?? 10))
      );
      ms.setActionHandler("seekbackward", (d) =>
        controlsRef.current.seek(Math.max(0, audio.currentTime - (d.seekOffset ?? 10)))
      );
    }

    const off = window.native?.onControl((action) => {
      if (action === "play") resume();
      else if (action === "pause") pause();
      else if (action === "playpause") controlsRef.current.toggle();
      else if (action === "next") controlsRef.current.next();
      else if (action === "previous") controlsRef.current.prev();
    });

    return () => {
      if (ms) for (const a of ACTIONS) ms.setActionHandler(a, null);
      off?.();
    };
  }, [audioRef]);

  // Metadata follows the current track (drives the SMTC title/artist/artwork).
  // `current`'s identity only changes on track change, so this won't refire on
  // position ticks.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    if (!current) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album ?? undefined,
      artwork: current.thumbnail
        ? [{ src: current.thumbnail, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
  }, [current]);

  // Play state + playhead → SMTC scrubber and the Windows taskbar.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (ms) {
      ms.playbackState = current ? (isPlaying ? "playing" : "paused") : "none";
      if (duration > 0 && position <= duration) {
        try {
          ms.setPositionState({ duration, position, playbackRate: 1 });
        } catch {
          // Some platforms reject odd duration/position combos; non-fatal.
        }
      }
    }
    window.native?.updatePlayback({ hasTrack: !!current, isPlaying, position, duration });
  }, [current, isPlaying, position, duration]);
}
