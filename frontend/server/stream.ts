// Audio streaming — fully hand-rolled, no yt-dlp / no JS challenge solver.
//
// We resolve a direct googlevideo URL via the native ANDROID_VR player call
// (innertube.ts `resolveAudio`): that client returns ready-to-stream URLs with
// no signatureCipher, no `n` throttle param, and no po_token — so there is
// nothing to descramble. Sending the captured session's `visitorData` (see
// innertube.ts) defeats the "not a bot" wall that otherwise breaks anonymous
// ANDROID_VR on repeat. We then proxy the bytes with HTTP Range support so the
// browser <audio> element can seek.

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveAudio, type AudioFormat } from "./innertube";
import { resolvePremiumAudio } from "./premium";

// Resolved URLs are short-lived signed links (the `expire` query param is hours
// out, but be conservative); cache them briefly to avoid a player round-trip on
// every Range request the browser makes while scrubbing. Keyed by quality, since
// HQ and standard resolve to different formats/URLs for the same video.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 30 * 60 * 1000;

// Resolve the audio format honoring the high-quality preference: when `hq` is
// set, try the premium itag-141 path first and fall back to the standard
// ANDROID_VR format if it's unavailable (non-Premium account, player rotation,
// etc.). Without `hq`, go straight to the standard path.
async function resolveFormat(videoId: string, hq: boolean): Promise<AudioFormat> {
  if (hq) {
    try {
      return await resolvePremiumAudio(videoId);
    } catch {
      /* fall through to the standard path */
    }
  }
  return resolveAudio(videoId);
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

  const range = req.headers["range"];
  const upstream = await fetch(url, {
    headers: range ? { Range: String(range) } : {},
  });

  const headers: Record<string, string> = { "Accept-Ranges": "bytes" };
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(k);
    if (v) headers[k] = v;
  }

  res.writeHead(upstream.status, headers);
  await pump(upstream.body, res);
}
