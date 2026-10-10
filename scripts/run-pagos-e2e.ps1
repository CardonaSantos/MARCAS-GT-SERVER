$ErrorActionPreference = "Stop"

function Read-DotEnvValue([string]$Name) {
  if (-not (Test-Path ".env")) { return $null }

  $line = Get-Content ".env" |
    Where-Object { $_ -match "^\s*$Name\s*=" } |
    Select-Object -First 1

  if (-not $line) { return $null }

  $value = ($line -split "=", 2)[1].Trim()

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  return $value
}

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  $env:DATABASE_URL = Read-DotEnvValue "DATABASE_URL"
}

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw "DATABASE_URL no existe en la sesion ni en .env."
}

$uri = [System.Uri]$env:DATABASE_URL
$allowedHosts = @("localhost", "127.0.0.1", "::1")

if ($allowedHosts -notcontains $uri.Host.ToLowerInvariant()) {
  throw "Ejecucion rechazada: Pagos E2E solo puede usar PostgreSQL local. Host actual: $($uri.Host)"
}

Write-Host "Pagos V1 - HTTP E2E" -ForegroundColor Cyan

npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy fallo." }

npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate fallo." }

npx jest --config .\test\jest-pagos-e2e.json --runInBand
if ($LASTEXITCODE -ne 0) {
  throw "La suite HTTP E2E de Pagos fallo."
}

Write-Host "Pagos HTTP E2E aprobada." -ForegroundColor Green
