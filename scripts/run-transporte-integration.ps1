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

if ([string]::IsNullOrWhiteSpace($TestDatabaseUrl)) {
  throw @"
TEST_DATABASE_URL es obligatoria.

Ejemplo:
.\scripts\run-transporte-integration.ps1 `
  -TestDatabaseUrl "postgresql://postgres:password@localhost:5432/sistemv1db?schema=public"
"@
}

$originalDatabaseUrl = $env:DATABASE_URL
$originalTestDatabaseUrl = $env:TEST_DATABASE_URL

try {
  $env:TEST_DATABASE_URL = $TestDatabaseUrl

  Write-Host ""
  Write-Host "Transporte V1 - Fase 3: PostgreSQL Integration" -ForegroundColor Cyan
  Write-Host ""

  Write-Host "1/3 Aplicando migraciones en TEST_DATABASE_URL..." -ForegroundColor Yellow

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
