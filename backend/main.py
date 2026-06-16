"""
ytmusicnative backend
=====================
A thin local API that powers the custom desktop UI.

- /search        -> song metadata via ytmusicapi
- /stream/{id}   -> audio bytes, resolved with yt-dlp and proxied with HTTP Range
                    support so the browser <audio> element can seek.
- /auth/*        -> OAuth device-flow login (personal Google account)
- /library/*     -> the signed-in user's playlists, liked songs, etc.

This is for PERSONAL/local use. It relies on unofficial endpoints and is not
ToS-compliant for redistribution. Do not deploy publicly.
"""

import time
from typing import Optional

import auth as auth_store
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL

app = FastAPI(title="ytmusicnative")

# The frontend runs on a different port in dev (Vite) and inside Tauri's
# webview in prod, so allow everything locally.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ytmusicapi works unauthenticated for search/browse. German locale so the
# home shelf titles ("Neuerscheinungen", "Hits von Heute", …) match the UI.
yt = YTMusic(language="de")

# Authenticated client, populated after browser login. None when logged out.
authed: Optional[YTMusic] = auth_store.build_authed()


def require_auth() -> YTMusic:
    if authed is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return authed

# Resolved audio URLs are short-lived signed googlevideo URLs. Cache them
# briefly so repeated range requests for the same track don't re-run yt-dlp.
_stream_cache: dict[str, tuple[str, float]] = {}
_STREAM_TTL = 60 * 30  # 30 minutes

_YDL_OPTS = {
    # Prefer progressive HTTPS audio the <audio> element can decode directly
    # (AAC/m4a or Opus/webm). Explicitly avoid HLS/DASH manifests, which the
    # browser cannot play from a plain src and cause NotSupportedError.
    "format": (
        "bestaudio[ext=m4a][protocol^=http]/"
        "bestaudio[ext=webm][protocol^=http]/"
        "bestaudio[protocol^=http]/bestaudio"
    ),
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
}


def _thumb(thumbnails: list[dict]) -> Optional[str]:
    if not thumbnails:
        return None
    return thumbnails[-1].get("url")


def normalize_track(item: dict) -> Optional[dict]:
    """Map a ytmusicapi song/track item to the shape the UI renders."""
    vid = item.get("videoId")
    if not vid:
        return None
    artists = ", ".join(a["name"] for a in item.get("artists", []) if a.get("name"))
    album = item.get("album")
    album_name = album.get("name") if isinstance(album, dict) else album
    return {
        "videoId": vid,
        "title": item.get("title"),
        "artist": artists,
        "album": album_name,
        "duration": item.get("duration"),
        "durationSeconds": item.get("duration_seconds"),
        "thumbnail": _thumb(item.get("thumbnails", [])),
    }


def normalize_tracks(items: list[dict]) -> list[dict]:
    out, seen = [], set()
    for it in items:
        t = normalize_track(it)
        if t and t["videoId"] not in seen:
            seen.add(t["videoId"])
            out.append(t)
    return out


def _fmt_views(views: Optional[str]) -> Optional[str]:
    if not views:
        return None
    return f"{views} Aufrufe"


def normalize_home_item(it: dict) -> Optional[dict]:
    """
    Map a get_home() content item to a home card. Items come in two flavours:
    songs/videos (have a videoId) and playlists/albums (browse targets). Card
    aspect is "video" for landscape thumbnails (music videos) and "square"
    otherwise — exactly how YouTube Music lays them out.
    """
    thumbs = it.get("thumbnails") or []
    if not thumbs:
        return None
    last = thumbs[-1]
    thumb = last.get("url")
    wide = last.get("width", 0) > last.get("height", 1) * 1.2

    vid = it.get("videoId")
    if vid:
        artists = ", ".join(a["name"] for a in it.get("artists", []) if a.get("name"))
        subtitle = " · ".join(
            x for x in [artists, _fmt_views(it.get("views"))] if x
        )
        return {
            "kind": "video",
            "videoId": vid,
            "title": it.get("title"),
            "subtitle": subtitle or artists,
            "thumbnail": thumb,
            "aspect": "video" if wide else "square",
            "explicit": bool(it.get("isExplicit")),
        }

    playlist_id = it.get("playlistId")
    return {
        "kind": "playlist" if playlist_id else "album",
        "playlistId": playlist_id,
        "browseId": it.get("browseId"),
        "title": it.get("title"),
        "subtitle": it.get("description"),
        "thumbnail": thumb,
        "aspect": "square",
        "explicit": bool(it.get("isExplicit")),
    }


@app.get("/home")
def home(limit: int = 8):
    """The home feed: a list of titled shelves, each with cards to render."""
    shelves = []
    for sh in yt.get_home(limit=limit):
        cards = [
            c
            for c in (normalize_home_item(it) for it in (sh.get("contents") or []))
            if c and c.get("thumbnail")
        ]
        if cards:
            shelves.append({"title": sh.get("title"), "cards": cards})
    return {"shelves": shelves}


@app.get("/search")
def search(q: str, limit: int = 25):
    """Search songs and return a clean shape the UI can render directly."""
    if not q.strip():
        return {"results": []}
    return {"results": normalize_tracks(yt.search(q, filter="songs", limit=limit))}


def _resolve_audio_url(video_id: str) -> str:
    cached = _stream_cache.get(video_id)
    if cached and cached[1] > time.time():
        return cached[0]

    with YoutubeDL(_YDL_OPTS) as ydl:
        info = ydl.extract_info(
            f"https://music.youtube.com/watch?v={video_id}", download=False
        )
    url = info["url"]
    _stream_cache[video_id] = (url, time.time() + _STREAM_TTL)
    return url


@app.get("/stream/{video_id}")
async def stream(video_id: str, request: Request):
    """
    Proxy the audio so the browser never talks to googlevideo directly.
    Forwards the client's Range header and mirrors the upstream 206 response,
    which is what makes seeking work.
    """
    try:
        audio_url = _resolve_audio_url(video_id)
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": f"resolve failed: {e}"}, status_code=502)

    range_header = request.headers.get("range")
    upstream_headers = {}
    if range_header:
        upstream_headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=None)
    upstream = await client.send(
        client.build_request("GET", audio_url, headers=upstream_headers),
        stream=True,
    )

    passthrough = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower()
        in ("content-type", "content-length", "content-range", "accept-ranges")
    }
    passthrough.setdefault("Accept-Ranges", "bytes")

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        body(), status_code=upstream.status_code, headers=passthrough
    )


# --------------------------------------------------------------------------
# Auth (browser headers)
# --------------------------------------------------------------------------


class BrowserBody(BaseModel):
    headers: str


@app.get("/auth/status")
def auth_status():
    return {"authenticated": authed is not None}


@app.post("/auth/browser")
def auth_browser(body: BrowserBody):
    """
    Accept request headers copied from a logged-in music.youtube.com session,
    build a browser.json, and verify it actually authenticates by making a real
    library call.
    """
    global authed
    if not body.headers.strip():
        raise HTTPException(status_code=400, detail="no headers provided")
    try:
        auth_store.save_browser(body.headers)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not parse headers: {e}")

    candidate = auth_store.build_authed()
    if candidate is None:
        auth_store.logout()
        raise HTTPException(status_code=400, detail="headers invalid")

    # Verify against a real authenticated endpoint before accepting.
    try:
        candidate.get_library_playlists(limit=1)
    except Exception as e:  # noqa: BLE001
        auth_store.logout()
        raise HTTPException(
            status_code=400,
            detail=f"headers did not authenticate (are you logged in?): {e}",
        )

    authed = candidate
    return {"ok": True}


@app.post("/auth/logout")
def auth_logout():
    global authed
    auth_store.logout()
    authed = None
    return {"ok": True}


# --------------------------------------------------------------------------
# Library (requires auth)
# --------------------------------------------------------------------------


@app.get("/library/playlists")
def library_playlists():
    yt_auth = require_auth()
    items = yt_auth.get_library_playlists(limit=50)
    return {
        "playlists": [
            {
                "playlistId": p.get("playlistId"),
                "title": p.get("title"),
                "thumbnail": _thumb(p.get("thumbnails", [])),
                "count": p.get("count"),
            }
            for p in items
            if p.get("playlistId")
        ]
    }


@app.get("/library/liked")
def library_liked():
    yt_auth = require_auth()
    data = yt_auth.get_liked_songs(limit=100)
    return {"results": normalize_tracks(data.get("tracks", []))}


@app.get("/library/songs")
def library_songs():
    yt_auth = require_auth()
    return {"results": normalize_tracks(yt_auth.get_library_songs(limit=100))}


@app.get("/playlist/{playlist_id}")
def playlist_tracks(playlist_id: str):
    yt_auth = require_auth()
    data = yt_auth.get_playlist(playlist_id, limit=200)
    return {
        "title": data.get("title"),
        "results": normalize_tracks(data.get("tracks", [])),
    }


@app.get("/health")
def health():
    return {"ok": True}
