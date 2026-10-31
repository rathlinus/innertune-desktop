# Music Assistant (YouTube Music Native)

This is the official Music Assistant beta server with one provider added:
**YouTube Music (Native)**. Everything else behaves like the official add-on.

## Before you start it

Stop the official Music Assistant add-on first. Both run on the host network
and use the same ports (8094, 8095, 8097), so only one can run at a time. This
add-on keeps its own settings and library; it does not touch the official one.

## Add YouTube Music

The provider needs an account with YouTube Music Premium. Setup refuses a free
account, as the official YouTube Music provider does.

Open the Music Assistant panel, then Settings → Providers → Add a music provider
→ **YouTube Music (Native)**. The form asks for the **Login Cookie**: the Cookie
header of a logged-in music.youtube.com session that nothing else uses. Sign in
to music.youtube.com in a private browser window, open the developer tools
(Network tab, any request to music.youtube.com, the `cookie` request header),
copy it, and close the window without signing out. The `ytm-login` tool from
the innertune-desktop repo prints one too; close its Chrome window right after.

A cookie copied from a browser you keep using gets signed out by YouTube after
a short while, because the browser refreshes the session on its own.

The provider's options (Premium audio quality, videos in search, reporting plays
to the YouTube Music history) are on its settings page afterwards.
