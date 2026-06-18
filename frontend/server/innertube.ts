// Direct InnerTube client — no youtubei.js, no yt-dlp.
//
// We replicate the exact youtubei/v1 requests the YouTube Music web client
// (WEB_REMIX) makes, authenticating with the session captured from the
// controlled Chrome (see chrome.ts):
//
//   - Cookie:               the full jar
//   - Authorization:        SAPISIDHASH <ts>_<sha1(ts SP SAPISID SP origin)>
//   - X-Goog-Visitor-Id:    VISITOR_DATA
//   - X-Youtube-Client-*:   WEB_REMIX name/version
//
// Audio is resolved with a *separate* ANDROID_VR player request (cookies left
// OFF, only the session's visitorData sent), which returns direct googlevideo
// URLs that need no signature/n descrambling and no po_token. See callPlayer /
// resolveAudio below.

import { createHash } from "node:crypto";
import { getSession } from "./chrome";

const MUSIC_ORIGIN = "https://music.youtube.com";
const MUSIC_API = `${MUSIC_ORIGIN}/youtubei/v1`;
const YT_API = "https://www.youtube.com/youtubei/v1";

// WEB_REMIX client enum + the UA the real web app sends.
const WEB_REMIX_NAME = 67;
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

// ANDROID_VR: REQUIRE_JS_PLAYER is false for this client, so the player
// response carries ready-to-stream URLs. Values mirror the real VR app.
const ANDROID_VR_NAME = 28;
const ANDROID_VR = {
  clientName: "ANDROID_VR",
  clientVersion: "1.62.27",
  deviceMake: "Oculus",
  deviceModel: "Quest 3",
  androidSdkVersion: 32,
  osName: "Android",
  osVersion: "12",
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip",
  hl: "en",
  gl: "US",
};

function cookieValue(cookie: string, name: string): string | null {
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// SAPISIDHASH auth header, exactly as the Google web clients build it:
//   SHA1("<unix_seconds> <SAPISID> <origin>")
function sapisidAuth(cookie: string): string | null {
  const sapisid =
    cookieValue(cookie, "SAPISID") ||
    cookieValue(cookie, "__Secure-3PAPISID") ||
    cookieValue(cookie, "__Secure-1PAPISID");
  if (!sapisid) return null;
  const ts = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1")
    .update(`${ts} ${sapisid} ${MUSIC_ORIGIN}`)
    .digest("hex");
  return `SAPISIDHASH ${ts}_${hash}`;
}

// Build the WEB_REMIX context, preferring the captured INNERTUBE_CONTEXT (so
// locale/experiments match the real client) and ensuring the bits we depend on.
function webContext(): Record<string, unknown> {
  const s = getSession();
  const captured = (s?.context as any) ?? null;
  const client = {
    ...(captured?.client ?? {}),
    clientName: "WEB_REMIX",
    clientVersion: s?.clientVersion ?? captured?.client?.clientVersion ?? "1.20240911.01.00",
    hl: captured?.client?.hl ?? "de",
    gl: captured?.client?.gl ?? "DE",
    visitorData: s?.visitor_data ?? captured?.client?.visitorData ?? undefined,
  };
  return { ...(captured ?? {}), client, user: captured?.user ?? {} };
}

export class NotAuthedError extends Error {
  constructor() {
    super("not authenticated");
  }
}

// Authenticated WEB_REMIX call. `endpoint` is e.g. "browse" | "search" | "next".
export async function callMusic<T = any>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const s = getSession();
  if (!s) throw new NotAuthedError();
  const auth = sapisidAuth(s.cookie);
  if (!auth) throw new NotAuthedError();

  const url = `${MUSIC_API}/${endpoint}?prettyPrint=false${
    s.apiKey ? `&key=${s.apiKey}` : ""
  }`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Cookie: s.cookie,
      Authorization: auth,
      Origin: MUSIC_ORIGIN,
      "X-Origin": MUSIC_ORIGIN,
      Referer: `${MUSIC_ORIGIN}/`,
      "X-Goog-AuthUser": "0",
      ...(s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {}),
      "X-Youtube-Client-Name": String(WEB_REMIX_NAME),
      "X-Youtube-Client-Version": s.clientVersion ?? "1.20240911.01.00",
      "User-Agent": WEB_UA,
    },
    body: JSON.stringify({ context: webContext(), ...body }),
  });
  if (!res.ok) {
    throw new Error(`InnerTube ${endpoint} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// get_song — track metadata from the WEB_REMIX player. We only read
// videoDetails + microformat here (no streaming formats), so the authed
// WEB_REMIX player is fine even though its audio formats are ciphered (audio
// itself still comes from the separate ANDROID_VR path in resolveAudio).
export interface SongDetails {
  videoId: string;
  title: string | null;
  author: string | null;
  channelId: string | null;
  lengthSeconds: number | null;
  viewCount: number | null;
  musicVideoType: string | null;
  thumbnail: string | null;
  publishDate: string | null;
  category: string | null;
}

export async function songDetails(videoId: string): Promise<SongDetails> {
  const pr = await callMusic<any>("player", {
    videoId,
    playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
    contentCheckOk: true,
    racyCheckOk: true,
  });
  const vd = pr?.videoDetails ?? {};
  const mf = pr?.microformat?.microformatDataRenderer ?? pr?.microformat?.playerMicroformatRenderer ?? {};
  const thumbs: any[] = vd?.thumbnail?.thumbnails ?? [];
  return {
    videoId: vd.videoId ?? videoId,
    title: vd.title ?? null,
    author: vd.author ?? null,
    channelId: vd.channelId ?? null,
    lengthSeconds: vd.lengthSeconds ? Number(vd.lengthSeconds) : null,
    viewCount: vd.viewCount ? Number(vd.viewCount) : null,
    musicVideoType: vd.musicVideoType ?? null,
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null,
    publishDate: mf.publishDate ?? mf.uploadDate ?? null,
    category: mf.category ?? null,
  };
}

// add_history_item — record a play in the account's watch history by pinging the
// track's videostats playback URL (exactly what the web client does on play).
// Needs the WEB_REMIX player (cookies) to get a tracking URL bound to the
// account; the ping itself is a cookie'd GET with a random client-play-nonce.
const CPN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function makeCpn(): string {
  let s = "";
  for (let i = 0; i < 16; i++) s += CPN_CHARS[Math.floor(Math.random() * 64)];
  return s;
}

export async function addHistoryItem(videoId: string): Promise<void> {
  const s = getSession();
  if (!s) throw new NotAuthedError();
  const pr = await callMusic<any>("player", {
    videoId,
    playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
    contentCheckOk: true,
    racyCheckOk: true,
  });
  const base: string | undefined = pr?.playbackTracking?.videostatsPlaybackUrl?.baseUrl;
  if (!base) throw new Error("no playback tracking url");
  const url = new URL(base);
  url.searchParams.set("ver", "2");
  url.searchParams.set("c", "WEB_REMIX");
  url.searchParams.set("cpn", makeCpn());
  const res = await fetch(url.toString(), {
    headers: {
      Cookie: s.cookie,
      Origin: MUSIC_ORIGIN,
      Referer: `${MUSIC_ORIGIN}/`,
      "X-Goog-AuthUser": "0",
      ...(s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {}),
      "User-Agent": WEB_UA,
    },
  });
  if (!res.ok) throw new Error(`history ping ${res.status}`);
}

// get_album_browse_id — resolve an album's audioPlaylistId (OLAK5uy_…) to its
// album browseId (MPREb_…). The album page itself isn't reachable from the
// OLAK id via the API, but the web playlist page embeds the browseId; we fetch
// it (cookie'd) and pull the MPREb_ id straight out of the HTML.
export async function resolveAlbumBrowseId(audioPlaylistId: string): Promise<string | null> {
  const s = getSession();
  const res = await fetch(`${MUSIC_ORIGIN}/playlist?list=${encodeURIComponent(audioPlaylistId)}`, {
    headers: {
      ...(s?.cookie ? { Cookie: s.cookie } : {}),
      ...(s?.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {}),
      "Accept-Language": "de",
      "User-Agent": WEB_UA,
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/MPREb_[A-Za-z0-9_-]+/)?.[0] ?? null;
}

// upload_song — upload a local audio file to the account's private library via
// YouTube's resumable upload server. Two steps: (1) ask for an upload URL,
// (2) PUT the bytes and finalize. Writes to the real account.
//
// NOTE: implemented to the documented flow but NOT verified against the live
// service here (no throwaway path for uploads). Treat as best-effort.
export async function uploadSong(filePath: string): Promise<boolean> {
  const s = getSession();
  if (!s) throw new NotAuthedError();
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const data = await readFile(filePath);
  const headers = {
    Cookie: s.cookie,
    Authorization: sapisidAuth(s.cookie) ?? "",
    Origin: MUSIC_ORIGIN,
    "X-Origin": MUSIC_ORIGIN,
    Referer: `${MUSIC_ORIGIN}/`,
    "X-Goog-AuthUser": "0",
    "User-Agent": WEB_UA,
  };

  // Step 1: request the resumable upload session.
  const start = await fetch("https://upload.youtube.com/upload/usermusic/http?authuser=0", {
    method: "POST",
    headers: {
      ...headers,
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(data.byteLength),
      "X-Goog-Upload-Protocol": "resumable",
    },
    body: basename(filePath),
  });
  const uploadUrl = start.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error(`upload start failed ${start.status}`);

  // Step 2: send the bytes and finalize.
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...headers,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: data,
  });
  return done.status === 200;
}

// ANDROID_VR player call — returns direct, descramble-free stream URLs (no
// signatureCipher, no `n` throttle, no po_token), so we never need a JS
// challenge solver or yt-dlp for audio.
//
// The catch: bare/anonymous ANDROID_VR is bot-walled on repeat
// ("LOGIN_REQUIRED – Sign in to confirm you're not a bot"). The fix is to send
// the captured session's `visitorData` (a "blessed" visitor id from the real
// logged-in browser) — NOT the cookies. With it the bot wall disappears (verified
// 8/8 on repeat); WITH cookies the request is rejected. So: visitorData yes,
// cookies no. This is why the metadata (cookie auth) and audio (visitorData only)
// paths stay separate.
export async function callPlayer<T = any>(videoId: string): Promise<T> {
  const visitorData = getSession()?.visitor_data;
  const client = visitorData ? { ...ANDROID_VR, visitorData } : ANDROID_VR;
  const res = await fetch(`${YT_API}/player?prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://www.youtube.com",
      ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
      "X-Youtube-Client-Name": String(ANDROID_VR_NAME),
      "X-Youtube-Client-Version": ANDROID_VR.clientVersion,
      "User-Agent": ANDROID_VR.userAgent,
    },
    body: JSON.stringify({
      context: { client },
      videoId,
      playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`player ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface AudioFormat {
  itag: number;
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: string;
}

// "Statistics for nerds" — the technical details of the audio the player is
// actually pulling, read straight from the ANDROID_VR player response (the same
// call resolveAudio uses). Codec/container are split out of the mimeType and the
// playback loudness comes from playerConfig.audioConfig.
export interface StreamInfo {
  videoId: string;
  itag: number | null;
  codec: string | null;
  container: string | null;
  bitrate: number | null;
  averageBitrate: number | null;
  audioSampleRate: string | null;
  audioChannels: number | null;
  contentLength: string | null;
  loudnessDb: number | null;
  client: string;
}

export async function streamInfo(videoId: string): Promise<StreamInfo> {
  const pr = await callPlayer(videoId);
  const formats: any[] = pr?.streamingData?.adaptiveFormats ?? [];
  const f =
    formats
      .filter((x) => x.url && typeof x.mimeType === "string" && x.mimeType.includes("audio"))
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0] ?? {};
  const mime: string = f.mimeType ?? "";
  const container = mime.split(";")[0]?.split("/")[1] ?? null;
  const codec = /codecs="([^"]+)"/.exec(mime)?.[1] ?? null;
  return {
    videoId,
    itag: f.itag ?? null,
    codec,
    container,
    bitrate: f.bitrate ?? null,
    averageBitrate: f.averageBitrate ?? null,
    audioSampleRate: f.audioSampleRate ?? null,
    audioChannels: f.audioChannels ?? null,
    contentLength: f.contentLength ?? null,
    loudnessDb: pr?.playerConfig?.audioConfig?.loudnessDb ?? null,
    client: "ANDROID_VR",
  };
}

// Resolve the best direct audio URL for a video via the ANDROID_VR player.
// Picks the highest-bitrate audio-only format that carries a ready `url`
// (anonymous ANDROID_VR tops out around itag 251 opus ~150k / itag 140 aac).
export async function resolveAudio(videoId: string): Promise<AudioFormat> {
  const pr = await callPlayer(videoId);
  const status = pr?.playabilityStatus?.status;
  const formats: any[] = pr?.streamingData?.adaptiveFormats ?? [];
  const audio = formats
    .filter((f) => f.url && typeof f.mimeType === "string" && f.mimeType.includes("audio"))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  if (!audio.length) {
    const reason = pr?.playabilityStatus?.reason || status || "no audio formats";
    throw new Error(`player: ${reason}`);
  }
  const f = audio[0];
  return {
    itag: f.itag,
    url: f.url,
    mimeType: f.mimeType,
    bitrate: f.bitrate ?? 0,
    contentLength: f.contentLength,
  };
}
