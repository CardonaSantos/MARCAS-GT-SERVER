param(
  [Parameter(Mandatory = $false)]
  [string]$TestDatabaseUrl = $env:TEST_DATABASE_URL
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
  param([string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "$Step fallo con codigo $LASTEXITCODE."
  }
}

function Get-DatabaseUrlFromDotEnv {
  $envPath = Join-Path (Get-Location) ".env"

  if (-not (Test-Path $envPath)) {
    return $null
  }

  $line = Get-Content $envPath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  $value = ($line -split '=', 2)[1].Trim()

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  return $value
}

function Assert-LocalDatabaseUrl {
  param([string]$Url)

  try {
    $uri = [System.Uri]$Url
  }
  catch {
    throw "La URL de PostgreSQL no es valida."
  }

  $allowedHosts = @("localhost", "127.0.0.1", "::1")

  if ($allowedHosts -notcontains $uri.Host.ToLowerInvariant()) {
    throw "La integracion de Transporte solo puede ejecutarse contra PostgreSQL local."
  }
}

if ([string]::IsNullOrWhiteSpace($TestDatabaseUrl)) {
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    $TestDatabaseUrl = $env:DATABASE_URL
  }
  else {
    $TestDatabaseUrl = Get-DatabaseUrlFromDotEnv
  }
}

if ([string]::IsNullOrWhiteSpace($TestDatabaseUrl)) {
  throw @"
No se encontro una URL de PostgreSQL para integracion.

Puedes usar tu DATABASE_URL local del archivo .env o pasarla explicitamente:

.\scripts\run-transporte-integration.ps1 `
  -TestDatabaseUrl "postgresql://postgres:password@localhost:5432/sistemv1db?schema=public"
"@
}

Assert-LocalDatabaseUrl $TestDatabaseUrl

$originalDatabaseUrl = $env:DATABASE_URL
$originalTestDatabaseUrl = $env:TEST_DATABASE_URL

try {
  $env:TEST_DATABASE_URL = $TestDatabaseUrl

  Write-Host ""
  Write-Host "Transporte V1 - Fase 3: PostgreSQL Integration" -ForegroundColor Cyan
  Write-Host "Base local: $TestDatabaseUrl"
  Write-Host ""

  Write-Host "1/3 Aplicando migraciones..." -ForegroundColor Yellow

  $env:DATABASE_URL = $TestDatabaseUrl

  npx prisma migrate deploy
  Assert-LastExitCode "prisma migrate deploy"

  Write-Host ""
  Write-Host "2/3 Regenerando Prisma Client..." -ForegroundColor Yellow

  npx prisma generate
  Assert-LastExitCode "prisma generate"

  $env:DATABASE_URL = $originalDatabaseUrl

  Write-Host ""
  Write-Host "3/3 Ejecutando integracion Transporte..." -ForegroundColor Yellow

  npx jest --config .\test\jest-transporte-integration.json --runInBand
  Assert-LastExitCode "La suite de integracion de Transporte"

  Write-Host ""
  Write-Host "Fase 3 de Transporte aprobada." -ForegroundColor Green
}
finally {
  $env:DATABASE_URL = $originalDatabaseUrl
  $env:TEST_DATABASE_URL = $originalTestDatabaseUrl
}
