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

Each image is also tagged `<MA version>-<provider commit>`, e.g. `2.11.0b7-e6267db`.

## Home Assistant add-on

This repo is also a Home Assistant add-on repository (`repository.yaml` at the
root, the add-on in `addon/`). It is the official Music Assistant beta add-on
running the beta image above. Add this URL under Settings → Add-ons → Add-on
Store → ⋮ → Repositories:

```
https://github.com/rathlinus/innertune-desktop#music-assistant
```

The `#music-assistant` part selects this branch; drop it once the branch is
merged into main. Stop the official Music Assistant add-on before starting this
one, since both use the same ports on the host network.

The add-on's `version` in `addon/config.yaml` is the image tag it installs. When
you move the `repos/server` pointer, set it to the new `2.11.0b7-<commit>` tag
(the workflow warns when they differ), so Home Assistant offers the update.

## The cookie

The setup form asks for the Cookie header of a logged-in music.youtube.com
session. Give Music Assistant a session nothing else uses, like the desktop app
has its own. The provider never refreshes the cookies (no RotateCookies), and a
session nothing else touches stays logged in for months. When a browser keeps
using the same session, it refreshes the cookies itself and YouTube signs the
copy in Music Assistant out.

- **ytm-login** (`repos/ytm-login`) logs in with its own Chrome profile and prints
  a "Login Cookie". Close that Chrome window as soon as it is printed.
- **Browser DevTools**: sign in to music.youtube.com in a private window, Network
  tab, any request, copy the `cookie` request header, then close the window
  without signing out.
- **The desktop app's session** (`%APPDATA%\frontend\data\session.json`, field
  `cookie`) also works, since neither side refreshes it.

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
