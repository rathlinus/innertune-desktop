import { useCallback, useState } from "react";

// User-tunable client settings, persisted to localStorage so they survive
// restarts. Kept deliberately small: every option here is actually wired into
// behaviour (no dead toggles).

export type VolumeCurve = "linear" | "exponential" | "logarithmic" | "antilog";

export interface Settings {
  // Auto-skip songs you've disliked when they come up on their own (radio /
  // autoplay). A manual thumbs-down always skips regardless of this.
  skipDisliked: boolean;
  // How the volume slider's position (0..1) maps to actual output gain.
  volumeCurve: VolumeCurve;
  // Restore the last track + queue + playhead on startup (paused).
  resumePlayback: boolean;
  // Cross-session "endless" autoplay: keep the queue topped up with radio so
  // music never just stops at the end of a finite list.
  endlessAutoplay: boolean;
  // Launch Innertune automatically when you log in to the system (minimised to
  // the tray). Desktop-only; a no-op in the browser. The OS login item is kept
  // in sync with this flag from App.tsx.
  autostart: boolean;
  // Show a small badge in the player bar telling you the audio quality of the
  // current stream — premium itag 141 (~256 kbps) vs. the standard fallback.
  showQualityBadge: boolean;
  // Stream premium audio (itag 141, ~256 kbps AAC) when available, instead of
  // the standard ~150 kbps format. Requires a YouTube Premium account; falls
  // back to standard automatically when premium isn't available. Applies to the
  // next track that loads.
  highQuality: boolean;
}

export const DEFAULTS: Settings = {
  skipDisliked: true,
  volumeCurve: "exponential",
  resumePlayback: true,
  endlessAutoplay: true,
  autostart: false,
  showQualityBadge: false,
  highQuality: true,
};

const STORAGE_KEY = "ytm.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* best-effort */
  }
}

/**
 * Map a linear slider position (0..1) to output gain (0..1) under the chosen
 * curve. Human loudness perception is roughly logarithmic, so a flat linear
 * mapping feels "all loud at the top"; the exponential (squared) default gives
 * even-feeling travel with fine control low down.
 */
export function volumeGain(curve: VolumeCurve, v: number): number {
  const x = Math.min(1, Math.max(0, v));
  switch (curve) {
    case "linear":
      return x;
    case "logarithmic":
      // Quick rise then a long plateau — lots of resolution near the top.
      return x <= 0 ? 0 : Math.log10(1 + 9 * x);
    case "antilog":
      // The exact inverse of the logarithmic curve (reflected across the
      // diagonal): a slow, flat start then a steep climb — only loud right at
      // the top. Standard "reverse-log" audio taper.
      return (Math.pow(10, x) - 1) / 9;
    case "exponential":
    default:
      return x * x;
  }
}

/**
 * Approximate perceived loudness (0..1) for a linear output gain, using the
 * psychoacoustic rule of thumb that loudness roughly doubles per +10 dB. This
 * is what the ear "hears", as opposed to the raw electrical gain.
 */
export function perceivedLoudness(gain: number): number {
  const g = Math.min(1, Math.max(0, gain));
  if (g <= 0) return 0;
  const db = 20 * Math.log10(g); // full scale (g=1) => 0 dB
  return Math.min(1, Math.pow(2, db / 10));
}

/** Settings state + a typed setter, persisted on every change. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, set };
}
