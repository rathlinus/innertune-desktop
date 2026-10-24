# Music Assistant test server

Runs the official Music Assistant image with the native YouTube Music provider
from the fork (`repos/server/music_assistant/providers/ytmusic_native`) built in.
Music Assistant itself is unchanged; only the provider is added.

## Start it

From this folder:

```sh
docker compose up -d --build
```

Open http://localhost:8095, create the admin user on first start, then go to
Settings → Providers → Add a music provider → **YouTube Music (Native)**.

## Prebuilt images

GitHub Actions (`.github/workflows/music-assistant.yml`) builds the same image for
amd64 and arm64 whenever this folder or the `repos/server` pointer changes, using
the fork commit that pointer names:

- `ghcr.io/rathlinus/ytmusic-native-ma:2.11.0b7` (also `:beta`)
- `ghcr.io/rathlinus/ytmusic-native-ma:2.10.8` (also `:stable`)

```sh
docker run -d --name ytmusic-native-ma -p 8095:8095 -p 8097:8097 -p 8927:8927 \
  -v ytmusic-native-ma:/data ghcr.io/rathlinus/ytmusic-native-ma:beta
```

On a Linux host, use `--network host` instead of the `-p` flags so speakers on
the network are found.

## The cookie

The setup form asks for the Cookie header of a logged-in music.youtube.com
session, and whether to keep the session alive.

- **ytm-login** (`repos/ytm-login`) logs in with its own Chrome profile and prints
  a "Login Cookie". That is a separate session, so leave "Keep the session alive"
  on: the provider then refreshes the cookies every 10 minutes and the login
  does not expire.
- **The desktop app's session** (`%APPDATA%\frontend\data\session.json`, field
  `cookie`) works too, but turn "Keep the session alive" **off**. With it on,
  Music Assistant rotates cookies the desktop app keeps using unchanged.
- **Browser DevTools**: Network tab on music.youtube.com, any request, copy the
  `cookie` request header. Close that browser window afterwards if you keep the
  session alive.

## Listen

The browser player (the "This device" player in the web UI) works through the
published ports. Speakers on your network (Chromecast, AirPlay, Sonos) are found
by mDNS, which Docker Desktop's bridge network does not pass through. For those,
run the container on a Linux host with `network_mode: host` instead of `ports:`.

## Other commands

```sh
docker compose up -d --build    # rebuild after changing the provider
docker compose logs -f          # server log
docker compose down             # stop, keep settings and library
docker compose down -v          # stop and wipe everything
```

The image defaults to Music Assistant 2.11.0b7, which matches the dev branch the
provider is written against. To test the stable release instead (PowerShell):

```powershell
docker compose down -v          # 2.10 can't open a database 2.11 already migrated
$env:MA_VERSION = "2.10.8"; docker compose up -d --build
```

For a debug log of just this provider, set its log level to Debug in the
provider's settings.
