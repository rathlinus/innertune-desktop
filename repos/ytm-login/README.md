# ytm-login

A tiny standalone tool that grabs the two values the **Music Assistant** YouTube
Music provider needs:

- **Visitor Data** — required for audio playback (the blessed `visitorData` the
  ANDROID_VR player path uses).
- **Login Cookie** — the authenticated cookie jar for metadata/library calls.

It opens a Chrome window with its own profile, you log into `music.youtube.com`
normally (Google login + 2FA happen in the browser), and then it prints both
values copy-paste ready and writes them to `ytm-session.txt`.

Written in Go with **only the standard library** — including a tiny hand-rolled
WebSocket client for the Chrome DevTools Protocol — so the binary is ~3 MB and
has no third-party dependencies.

## Use it

Run the executable for your OS:

- **Windows:** `ytm-login.exe`
- **Linux/macOS:** `./ytm-login`

A Chrome window opens; sign in. When the player finishes loading, your
credentials are printed in the terminal and saved next to the executable as
`ytm-session.txt`.

Then in Music Assistant: add/configure the **YouTube Music** provider and paste
**Visitor Data** and **Login Cookie** into their fields. For a normal account the
**Username** can be your Google email; for a *brand account* the tool prints the
21-digit id to use.

> Both values expire eventually (days). If playback later fails with
> "Sign in to confirm you're not a bot", just run this again and re-paste —
> the saved Chrome profile makes the re-grab near-instant.

## Build it yourself

Needs **Go ≥ 1.26**. From this folder:

```sh
./build.sh          # Linux/macOS/Git-Bash
# or
pwsh ./build.ps1    # Windows PowerShell
```

Both scripts cross-compile **for Windows and Linux at once** into `dist/`
(`-trimpath -ldflags "-s -w"` to strip symbols and shrink the binary). Go
cross-compiles cleanly from any host with no extra toolchain, so you can build
the Linux binary on Windows and vice-versa. A plain `go build` also works for the
host platform.

## Notes

- Chrome/Chromium must be installed. The tool auto-detects the usual locations;
  set `CHROME_PATH` to override.
- It launches Chrome with `--remote-debugging-port=0` and reads the actual port
  Chrome chose from the profile's `DevToolsActivePort` file — so it never collides
  with a busy port or one inside a Windows reserved/excluded range.
- It uses a dedicated profile at `~/.ytm-login/chrome-profile` (override with
  `YTM_PROFILE`), so your normal Chrome and its cookies are left untouched.
- `ytm-session.txt` contains live credentials — treat it like a password and don't
  commit it (it's git-ignored).
