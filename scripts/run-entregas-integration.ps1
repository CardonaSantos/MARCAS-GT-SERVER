$ErrorActionPreference = "Stop"

function Read-DotEnvValue([string]$Name) {
  if (-not (Test-Path ".env")) { return $null }
  $line = Get-Content ".env" | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split "=", 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { $env:DATABASE_URL = Read-DotEnvValue "DATABASE_URL" }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw "DATABASE_URL no existe en la sesion ni en .env." }

$uri = [System.Uri]$env:DATABASE_URL
if ($uri.Host -ne "localhost" -and $uri.Host -ne "127.0.0.1" -and $uri.Host -ne "::1") {
  throw "Ejecucion rechazada: Entregas integration solo puede usar PostgreSQL local. Host actual: $($uri.Host)"
}

Write-Host "Entregas V1 - PostgreSQL integration" -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy fallo." }
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate fallo." }
npx jest --config .\test\jest-entregas-integration.json --runInBand
if ($LASTEXITCODE -ne 0) { throw "La suite integration de Entregas fallo." }
Write-Host "Entregas PostgreSQL integration aprobada." -ForegroundColor Green
