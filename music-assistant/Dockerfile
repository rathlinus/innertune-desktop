# syntax=docker/dockerfile:1
#
# Music Assistant with the native YouTube Music provider dropped in, for testing.
# The provider source comes from the Music Assistant fork (repos/server), passed in
# as the "provider" build context by compose.yaml.

ARG MA_VERSION=2.11.0b7
FROM ghcr.io/music-assistant/server:${MA_VERSION}

# The provider's only dependency (V8 for the stream URL solver). Music Assistant
# would install it on first load too; baking it in keeps startup offline-safe.
RUN uv pip install --python /app/venv/bin/python --no-cache mini-racer==0.14.1

COPY --from=provider . /tmp/ytmusic_native

# Put the provider next to the built-in ones and merge its strings into the
# compiled English translations, which is all Music Assistant reads at runtime.
RUN set -eu \
    && SITE="$(/app/venv/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib"))')" \
    && DEST="$SITE/music_assistant/providers/ytmusic_native" \
    && rm -rf "$DEST" /tmp/ytmusic_native/__pycache__ \
    && mv /tmp/ytmusic_native "$DEST" \
    && /app/venv/bin/python - "$DEST/strings.json" "$SITE/music_assistant/translations/en.json" <<'EOF'
import json
import sys

strings_path, source_path = sys.argv[1:3]
with open(strings_path, encoding="utf-8") as fh:
    strings = json.load(fh)
with open(source_path, encoding="utf-8") as fh:
    source = json.load(fh)


def flatten(node, prefix):
    for key, value in node.items():
        if isinstance(value, dict):
            flatten(value, f"{prefix}{key}.")
        else:
            source[f"{prefix}{key}"] = value


flatten(strings, "provider.ytmusic_native.")
with open(source_path, "w", encoding="utf-8") as fh:
    json.dump(source, fh, ensure_ascii=False, indent=2, sort_keys=True)
EOF
RUN /app/venv/bin/python -m compileall -q \
    "$(/app/venv/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib"))')/music_assistant/providers/ytmusic_native"
