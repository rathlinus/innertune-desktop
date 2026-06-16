# Launches Innertune as a native desktop app (Electron) in dev mode.
# This starts the Vite dev server (which hosts both the React UI and the /api
# middleware) and opens the app in an Electron window — no browser involved.
# Usage:  ./start.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting Innertune (Electron) ..." -ForegroundColor Cyan
Push-Location "$root\frontend"
try {
  npm run electron:dev
}
finally {
  Pop-Location
}
