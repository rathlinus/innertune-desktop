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
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveAudio, type AudioFormat } from "./innertube";

// Resolved URLs are short-lived signed links (the `expire` query param is hours
// out, but be conservative); cache them briefly to avoid a player round-trip on
// every Range request the browser makes while scrubbing.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 30 * 60 * 1000;

async function resolveUrl(videoId: string): Promise<string> {
  const hit = cache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { url } = await resolveAudio(videoId);
  cache.set(videoId, { url, expires: Date.now() + TTL_MS });
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

// "Herunterladen" — stream the full audio with a Content-Disposition so the
// browser/Electron saves it to disk with a real song name + matching extension.
export async function downloadAudio(
  videoId: string,
  name: string,
  res: ServerResponse
): Promise<void> {
  let fmt: AudioFormat;
  try {
    fmt = await resolveAudio(videoId);
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
  if (upstream.body) Readable.fromWeb(upstream.body as any).pipe(res);
  else res.end();
}

export async function streamAudio(
  videoId: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let url: string;
  try {
    url = await resolveUrl(videoId);
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
  if (upstream.body) {
    Readable.fromWeb(upstream.body as any).pipe(res);
  } else {
    res.end();
  }
}
