import { useCallback, useState } from "react";

// The fullscreen player's "Titel / Video" choice. It sticks across tracks and
// sessions, like on YTM: switched by the toggle, and to "video" whenever a
// music-video card is played.
export type StageMode = "song" | "video";

const MODE_KEY = "ytm.fsp.mode";

function loadMode(): StageMode {
  try {
    return localStorage.getItem(MODE_KEY) === "video" ? "video" : "song";
  } catch {
    return "song";
  }
}

export function useStageMode(): [StageMode, (m: StageMode) => void] {
  const [mode, setModeState] = useState<StageMode>(loadMode);
  const setMode = useCallback((m: StageMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* not persisted — fine */
    }
  }, []);
  return [mode, setMode];
}
