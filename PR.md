# YouTube Music: ~1160% faster playback start by getting audio from the player API instead of yt-dlp

# What does this implement/fix?

This changes how the YouTube Music provider resolves the audio stream.

Instead of going through yt-dlp (which needs deno to solve the signature cipher
and a separate PO token server running), it now calls YouTube's player API
directly with the ANDROID_VR client. That client returns plain stream URLs that
don't need any descrambling, so yt-dlp, deno and the PO token server can all be
dropped.

The main reason is speed. In a local test, starting a song went from about 3.7
seconds down to about 0.3 seconds, because we no longer scrape the page and run
the cipher VM every time you press play.

| Phase | BEFORE (yt-dlp + deno cipher + cookies) | AFTER (native ANDROID_VR) |
|---|---|---|
| Resolve URL | 3581 ms median | 220 ms |
| Time-to-first-byte | 106 ms | 76 ms |
| CLICK → PLAY total | 3664 ms (~3.7 s) | 291 ms (~0.3 s) |

I also changed the ytmusicapi helpers to reuse one YTMusic object per thread
instead of creating a new one on every call. ytmusicapi makes an extra request
the first time each new object is used, so the old code paid that cost on every
request. Reusing it roughly halved search and browse times locally.

A few things to be aware of:

- There is a new required setting, Visitor Data, that you copy once from a logged
  in session. It can't be derived from the cookie, and without it the player
  request gets blocked.
- The PO Token Server URL setting, the deno requirement and the "Premium
  required" check at setup are removed.
- Audio quality is a bit lower. The new path tops out around 150 kbps opus / 130
  kbps AAC. The old path could reach 256 kbps on Premium accounts, which this one
  can't.

**Related issue (if applicable):**

- related issue <link to issue>

## Types of changes

<!--
Tick exactly one box. CI (.github/workflows/pr-labels.yaml) derives
the label from the ticked box and applies it automatically; the
release-notes generator uses that same label to slot this change
into the next release notes.
-->

- [ ] Bugfix (non-breaking change which fixes an issue) — `bugfix`
- [ ] New feature (non-breaking change which adds functionality) — `new-feature`
- [ ] Enhancement to an existing feature — `enhancement`
- [ ] New music/player/metadata/plugin provider — `new-provider`
- [x] Breaking change (fix or feature that would cause existing functionality to not work as expected) — `breaking-change`
- [ ] Refactor (no behaviour change) — `refactor`
- [ ] Documentation only — `documentation`
- [ ] Maintenance / chore — `maintenance`
- [ ] CI / workflow change — `ci`
- [ ] Dependencies bump — `dependencies`

## Checklist

- [x] The code change is tested and works locally.
- [ ] `pre-commit run --all-files` passes.
- [ ] `pytest` passes, and tests have been added/updated under `tests/` where applicable.
- [ ] For changes to shared models, the companion PR in `music-assistant/models` is linked.
- [ ] For changes affecting the UI, the companion PR in `music-assistant/frontend` is linked.
- [ ] I have read and complied with the project's [AI Policy](https://github.com/music-assistant/.github/blob/main/AI_POLICY.md) for any AI-assisted contributions.
- [ ] I have raised a PR against the documentation repository targeting the main or beta branch as appropriate.
