// Audio streaming — fully hand-rolled, no yt-dlp / no JS challenge solver.
//
// The bytes come from the *authenticated* WEB_REMIX web player (premium.ts),
// whose signatureCipher we descramble by driving the player's own URL decorator.
// We then proxy those bytes with HTTP Range support so the browser <audio>
// element can seek.
//
// The anonymous ANDROID_VR player (innertube.ts `resolveAudio`) used to be the
// primary source — it hands out ready-to-stream URLs with no signatureCipher and
// no `n` param, so there is nothing to descramble. It is now demoted to a last
// resort: googlevideo serves at most the first ~1 MiB from offset 0 on those
// URLs and answers 403 (empty body) for anything else — an open-ended
// `Range: bytes=0-`, any range starting past the first MiB, or a plain GET. That
// is roughly a minute of audio, so the path can no longer carry playback on its
// own. See resolveFormat.

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveAudio, type AudioFormat } from "./innertube";
import { resolvePremiumAudio, resolveAuthedAudio } from "./premium";

// Resolved URLs are short-lived signed links (the `expire` query param is hours
// out, but be conservative); cache them briefly to avoid a player round-trip on
// every Range request the browser makes while scrubbing. Keyed by quality, since
// HQ and standard resolve to different formats/URLs for the same video.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 30 * 60 * 1000;

// The largest range a capped ANDROID_VR fallback URL still serves (verified:
// `bytes=0-1048575` → 206, one byte more → 403).
const CAPPED_CHUNK = 1 << 20;

// Resolve the audio format honoring the high-quality preference:
//   - HQ: try the premium itag-141 path first.
//   - Otherwise (or if that is unavailable): the authenticated WEB_REMIX player,
//     which serves the full byte range and — being signed in — also plays what
//     the anonymous client refuses with LOGIN_REQUIRED, chiefly age-restricted
//     videos ("Sign in to confirm your age"). `hq` picks the tier there too, so
//     standard mode still gets ~itag 251 rather than a silent Premium upgrade.
//   - Only if the authenticated player fails as well do we fall back to the
//     anonymous ANDROID_VR format, which is capped at its first MiB (see the
//     file header) but is better than nothing when there is no usable session.
async function resolveFormat(videoId: string, hq: boolean): Promise<AudioFormat> {
  if (hq) {
    try {
      return await resolvePremiumAudio(videoId);
    } catch {
      /* fall through to the standard path */
    }
  }
  try {
    return await resolveAuthedAudio(videoId, hq);
  } catch {
    return resolveAudio(videoId);
  }
}

async function resolveUrl(videoId: string, hq: boolean): Promise<string> {
  const key = `${hq ? "hq" : "lo"}:${videoId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { url } = await resolveFormat(videoId, hq);
  cache.set(key, { url, expires: Date.now() + TTL_MS });
  return url;
}

// Pick a sensible file extension for a downloaded audio container.
function extFor(fmt: AudioFormat): string {
  if (fmt.mimeType.includes("audio/mp4")) return "m4a";
  if (fmt.mimeType.includes("audio/webm")) return "weba";
  return "audio";
}

// Sanitize a track title/artist into a safe download filename.
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "audio";
}

// Pump an upstream web ReadableStream into the HTTP response. `stream.pipeline`
// (unlike `.pipe()`) forwards errors and tears down both streams, so a mid-flight
// upstream ECONNRESET or a client that disconnects while scrubbing is swallowed
// here instead of bubbling up as an unhandled 'error' event that would crash the
// whole Electron main process (and kill all audio).
async function pump(body: ReadableStream | null, res: ServerResponse): Promise<void> {
  if (!body) {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(body as any), res);
  } catch {
    // Upstream reset or client aborted — normal during seeks/skips. Make sure the
    // socket is torn down; nothing else to do.
    if (!res.destroyed) res.destroy();
  }
}

// "Herunterladen" — stream the full audio with a Content-Disposition so the
// browser/Electron saves it to disk with a real song name + matching extension.
export async function downloadAudio(
  videoId: string,
  name: string,
  res: ServerResponse,
  hq = false
): Promise<void> {
  let fmt: AudioFormat;
  try {
    fmt = await resolveFormat(videoId, hq);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `resolve failed: ${e}` }));
    return;
  }
  const upstream = await fetch(fmt.url);
  // Never write a partial file to disk under a song's name: if the resolved URL
  // is a capped fallback (see the file header) it answers 403 with an empty body,
  // and a 0-byte "song.m4a" in the downloads folder is worse than a clear error.
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `download failed: upstream ${upstream.status}` }));
    return;
  }
  const filename = `${safeName(name || videoId)}.${extFor(fmt)}`;
  const headers: Record<string, string> = {
    "Content-Type": fmt.mimeType.split(";")[0] || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["Content-Length"] = len;
  res.writeHead(upstream.status, headers);
  await pump(upstream.body, res);
}

export async function streamAudio(
  videoId: string,
  req: IncomingMessage,
  res: ServerResponse,
  hq = false
): Promise<void> {
  let url: string;
  try {
    url = await resolveUrl(videoId, hq);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `resolve failed: ${e}` }));
    return;
  }

  const range = req.headers["range"] ? String(req.headers["range"]) : null;
  let upstream = await fetch(url, { headers: range ? { Range: range } : {} });
  // A 403 here means we are on a capped ANDROID_VR fallback URL (see the file
  // header): it refuses an open-ended range and plain GETs. Ask for a bounded
  // first chunk instead — returning fewer bytes than requested is legal, and the
  // media element simply asks for the next range — so the listener gets the audio
  // that IS served rather than a dead stream.
  if (upstream.status === 403) {
    const start = range ? Number(/^bytes=(\d+)-$/.exec(range)?.[1]) : 0;
    if (Number.isFinite(start)) {
      await upstream.body?.cancel().catch(() => {});
      upstream = await fetch(url, {
        headers: { Range: `bytes=${start}-${start + CAPPED_CHUNK - 1}` },
      });
    }
  }

  const headers: Record<string, string> = { "Accept-Ranges": "bytes" };
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(k);
    if (v) headers[k] = v;
  }

  res.writeHead(upstream.status, headers);
  await pump(upstream.body, res);
}
