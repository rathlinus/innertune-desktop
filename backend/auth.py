"""
Authentication state for ytmusicnative.

Uses ytmusicapi's *browser* authentication: the user pastes the request headers
from a logged-in music.youtube.com session, which ytmusicapi turns into a
browser.json that authenticates as the web client. This is the method that
actually works for library access (OAuth/TV-client tokens are rejected with
HTTP 400 by the music endpoints).

Stored under backend/data/ which is gitignored — these are personal secrets.
"""

import json
from pathlib import Path
from typing import Optional

from ytmusicapi import YTMusic
from ytmusicapi.setup import setup

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
BROWSER_FILE = DATA_DIR / "browser.json"


def has_browser() -> bool:
    return BROWSER_FILE.is_file()


def save_browser(headers_raw: str) -> None:
    """Turn pasted request headers into a stored browser.json. Raises on bad input."""
    config = setup(filepath=str(BROWSER_FILE), headers_raw=headers_raw)
    # Sanity check it produced something with a cookie.
    if "Cookie" not in config and "cookie" not in json.loads(
        BROWSER_FILE.read_text()
    ):
        raise ValueError("No Cookie found in pasted headers")


def logout() -> None:
    BROWSER_FILE.unlink(missing_ok=True)


def build_authed() -> Optional[YTMusic]:
    """Return an authenticated YTMusic, or None if not logged in / on failure."""
    if has_browser():
        try:
            return YTMusic(str(BROWSER_FILE))
        except Exception:
            return None
    return None
