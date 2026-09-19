import { useContext } from "react";
import type { MouseEvent } from "react";
import type { Track } from "./types";
import { OpenArtistContext } from "./artistNav";

/**
 * A track's artist credits, each name a link to its artist page. Falls back to
 * the plain `artist` string (linked to the menu's channelId when it's a single
 * artist) for tracks parsed before per-artist ids existed.
 */
export function ArtistLinks({ track }: { track: Pick<Track, "artist" | "artists" | "channelId"> }) {
  const open = useContext(OpenArtistContext);
  const credits = track.artists?.length
    ? track.artists
    : track.artist
      ? [{ name: track.artist, browseId: track.channelId ?? null }]
      : [];

  const go = (id: string) => (e: MouseEvent) => {
    // Rows play on (double-)click — don't let the link trigger that too.
    e.stopPropagation();
    e.preventDefault();
    open?.(id);
  };

  return (
    <>
      {credits.map((a, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {a.browseId && open ? (
            <a
              className="artist-link"
              href="#"
              onClick={go(a.browseId)}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {a.name}
            </a>
          ) : (
            a.name
          )}
        </span>
      ))}
    </>
  );
}
