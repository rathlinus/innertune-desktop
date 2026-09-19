# Builds Innertune from the current source, installs it over the copy on this
# PC and restarts it (frontend/scripts/update-local.mjs).
# Usage:  ./update.ps1               build + install + restart
#         ./update.ps1 --skip-build  reinstall the last built installer

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Push-Location "$root\frontend"
try {
  npm run update:local -- @args
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
