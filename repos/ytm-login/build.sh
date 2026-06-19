#!/usr/bin/env bash
# Cross-compile ytm-login for Windows and Linux (run from this folder).
#   ./build.sh
set -euo pipefail
mkdir -p dist
LDFLAGS="-s -w"  # strip symbol table + DWARF to shrink the binary

echo "Building Windows amd64..."
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" -o dist/ytm-login.exe .

echo "Building Linux amd64..."
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" -o dist/ytm-login .

ls -lh dist
