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
