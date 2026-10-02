$ErrorActionPreference = "Stop"

function Read-DotEnvValue([string]$Name) {
  if (-not (Test-Path ".env")) {
    return $null
  }

  $line = Get-Content ".env" |
    Where-Object { $_ -match "^\s*$Name\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

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

try {
  $uri = [System.Uri]$env:DATABASE_URL
}
catch {
  throw "DATABASE_URL no tiene un formato URL valido."
}

if (
  $uri.Host -ne "localhost" -and
  $uri.Host -ne "127.0.0.1" -and
  $uri.Host -ne "::1"
) {
  throw "Ejecucion rechazada: Transporte E2E solo puede usar PostgreSQL local. Host actual: $($uri.Host)"
}

Write-Host ""
Write-Host "Transporte V1 - Fase 4: HTTP E2E" -ForegroundColor Cyan
Write-Host "BD local E2E: $($uri.Host):$($uri.Port)$($uri.AbsolutePath)"
Write-Host ""

Write-Host "1/3 Verificando migraciones..." -ForegroundColor Yellow
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  throw "prisma migrate deploy fallo."
}

Write-Host ""
Write-Host "2/3 Regenerando Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
  throw "prisma generate fallo."
}

Write-Host ""
Write-Host "3/3 Ejecutando Transporte HTTP E2E..." -ForegroundColor Yellow
npx jest --config .\test\jest-transporte-e2e.json --runInBand
if ($LASTEXITCODE -ne 0) {
  throw "La suite HTTP E2E de Transporte fallo."
}

Write-Host ""
Write-Host "Fase 4 de Transporte aprobada." -ForegroundColor Green
