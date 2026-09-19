import { useEffect, useState } from "react";
import { getVideoInfo } from "./api";
import type { VideoCounterpart } from "./types";

// Per-track lookups for the "Titel / Video" toggle, kept for the session: the
// answer never changes and the toggle should appear instantly when a track comes
// back around.
const infoCache = new Map<string, VideoCounterpart>();

// The music video behind `videoId` (see VideoCounterpart), or null while it
// loads / if the lookup failed.
export function useVideoInfo(videoId: string | undefined): VideoCounterpart | null {
  const [loaded, setLoaded] = useState<{ id: string; info: VideoCounterpart } | null>(null);
  useEffect(() => {
    if (!videoId || infoCache.has(videoId)) return;
    let cancel = false;
    getVideoInfo(videoId)
      .then((info) => {
        infoCache.set(videoId, info);
        if (!cancel) setLoaded({ id: videoId, info });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [videoId]);
  if (!videoId) return null;
  return infoCache.get(videoId) ?? (loaded?.id === videoId ? loaded.info : null);
}
