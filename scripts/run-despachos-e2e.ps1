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
  throw "DATABASE_URL no existe en la sesión ni en .env."
}

try {
  $uri = [System.Uri]$env:DATABASE_URL
}
catch {
  throw "DATABASE_URL no tiene un formato URL válido."
}

if (
  $uri.Host -ne "localhost" -and
  $uri.Host -ne "127.0.0.1"
) {
  throw "Ejecución rechazada: esta suite E2E solo puede usar PostgreSQL local. Host actual: $($uri.Host)"
}

Write-Host "BD local E2E: $($uri.Host):$($uri.Port)$($uri.AbsolutePath)"
Write-Host ""

Write-Host "1/3 Verificando migraciones..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  throw "prisma migrate deploy falló."
}

Write-Host ""
Write-Host "2/3 Regenerando Prisma Client..."
npx prisma generate
if ($LASTEXITCODE -ne 0) {
  throw "prisma generate falló."
}

Write-Host ""
Write-Host "3/3 Ejecutando Despachos HTTP E2E..."
npx jest --config .\test\jest-despachos-e2e.json --runInBand
if ($LASTEXITCODE -ne 0) {
  throw "La suite E2E de Despachos falló."
}
