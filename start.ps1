# Launches ytmusicnative. Everything (React UI + API) now runs on ONE dev
# server via Vite middleware — no Python backend needed.
# Usage:  ./start.ps1   then open http://127.0.0.1:5173

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting ytmusicnative on http://127.0.0.1:5173 ..." -ForegroundColor Cyan
Push-Location "$root\frontend"
try {
  npm run dev -- --port 5173 --host 127.0.0.1
}
finally {
  Pop-Location
}
