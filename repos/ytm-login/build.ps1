# Cross-compile ytm-login for Windows and Linux (run from this folder).
#   pwsh ./build.ps1
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path dist | Out-Null

$ldflags = "-s -w"  # strip symbol table + DWARF to shrink the binary

Write-Host "Building Windows amd64..."
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags $ldflags -o dist/ytm-login.exe .

Write-Host "Building Linux amd64..."
$env:GOOS = "linux"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags $ldflags -o dist/ytm-login .

Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED -ErrorAction SilentlyContinue
Get-ChildItem dist | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
