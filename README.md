<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg" width="110" alt="YouTube Music">
  <h1>Innertune Desktop</h1>
  <p><em>a play on "InnerTube", the name of YouTube's internal API this thing talks to</em></p>
</div>

A small, self-hosted YouTube Music client that runs as a desktop app
(Electron). It talks to YouTube's real internal API (`youtubei/v1`), the same one
the web app uses, instead of going through a wrapper library. React front-end
with a thin server that runs in the app's main process (and as Vite middleware in
dev).

## Disclaimer (read this first)

> [!WARNING]
> This project sits in a **grey zone**. It drives YouTube Music's private API
> using a logged-in session from your own account. That goes against YouTube's
> terms of service even though nothing here is cracked or pirated.

A few things to be clear about:

- **You need YouTube Premium.** This is just a different front-end for an account
  you already pay for. Nothing else.
- **It does not evade, unlock, or bypass any Premium feature.** No ad removal for
  free accounts, no paywall circumvention, no DRM breaking. If your account can't
  do something in the official app, it can't do it here either.
- **Early alpha, not production ready.** Things break, the session capture is
  fiddly, and YouTube changes its API shapes without warning. Run it locally, for
  yourself, and don't expect it to be stable.

## How it works

The Electron main process (`frontend/electron/`) starts a tiny localhost HTTP
server (`frontend/server/`) that serves the built React SPA and routes `/api/*`
to the same handler the dev server uses, then loads it in a window — so the UI
and API stay same-origin, exactly as in a browser, just without one. To sign in,
the server launches a _controlled Chrome instance_ to capture a logged-in
session, then makes authenticated calls to `youtubei/v1` and parses the raw
renderer JSON directly. No `ytmusicapi`, `youtubei.js` or `yt-dlp` for metadata.

Audio is resolved through the ANDROID_VR player client. Direct stream URLs work
without cookies, but high-bitrate Premium audio is still gated behind the cipher
and isn't fully solved yet.

## Running it

Grab an installer from the [Releases](../../releases) page (Windows `.exe`
installer or Linux `.AppImage`), or run from source. You need a Chrome install
for the login capture; the captured session lives in your user-data dir
(`%APPDATA%/Innertune/data` on Windows) and stays out of git.

From source you need Node:

```powershell
cd frontend
npm install
cd ..
./start.ps1
```

`start.ps1` starts the Vite dev server and opens the app in an Electron window —
no browser involved. To build installers yourself: `cd frontend && npm run
build:electron` (output lands in `frontend/release/`).

## What works so far

- Search, home feed, artist and album pages
- Playlists: view, create, delete, rename, add/remove tracks
- Library and listening history
- Up-next / radio queues, related and similar tracks
- Lyrics, like/dislike, channel subscribe
- Audio playback (bitrate limited, see above)

## Status

This is a personal reverse-engineering project and a work in progress. Expect
rough edges and breakage when YouTube changes things on their end.
