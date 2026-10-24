# Music Assistant (YouTube Music Native)

This is the official Music Assistant beta server with one provider added:
**YouTube Music (Native)**. Everything else behaves like the official add-on.

## Before you start it

Stop the official Music Assistant add-on first. Both run on the host network
and use the same ports (8094, 8095, 8097), so only one can run at a time. This
add-on keeps its own settings and library; it does not touch the official one.

## Add YouTube Music

Open the Music Assistant panel, then Settings → Providers → Add a music provider
→ **YouTube Music (Native)**. The form asks for two things:

- **Login Cookie**: the Cookie header of a logged-in music.youtube.com session.
  The `ytm-login` tool from the innertune-desktop repo prints one, or copy it
  from the browser's developer tools (Network tab, any request to
  music.youtube.com, the `cookie` request header).
- **Keep the session alive**: refreshes the cookies every 10 minutes so the
  login does not expire. Leave it on for a cookie nothing else uses. Turn it off
  if the same cookie is also used elsewhere, for example by the innertune
  desktop app.

The provider's options (Premium audio quality, videos in search, reporting plays
to the YouTube Music history) are on its settings page afterwards.
