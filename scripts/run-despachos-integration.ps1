param(
  [string]$TestDatabaseUrl = $env:TEST_DATABASE_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TestDatabaseUrl)) {
  throw @"
TEST_DATABASE_URL no está definida.

Ejemplo local:
  `$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marcas_test?schema=public"

O usando un schema separado:
  `$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marcas?schema=despachos_test"
"@
}

if (
  -not [string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and
  $env:DATABASE_URL.TrimEnd('/') -eq $TestDatabaseUrl.TrimEnd('/')
) {
  throw "TEST_DATABASE_URL es igual a DATABASE_URL. Ejecución rechazada por seguridad."
}

if ($TestDatabaseUrl -notmatch "(?i)test") {
  throw 'La URL de pruebas debe contener "test" en el nombre de BD o schema.'
}

$originalDatabaseUrl = $env:DATABASE_URL

try {
  Write-Host "Usando base de integración aislada."
  $env:DATABASE_URL = $TestDatabaseUrl
  $env:TEST_DATABASE_URL = $TestDatabaseUrl

  Write-Host ""
  Write-Host "1/3 Aplicando migraciones a TEST_DATABASE_URL..."
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
  Write-Host "3/3 Ejecutando integración Despachos..."
  npx jest --config .\test\jest-despachos-integration.json --runInBand
  if ($LASTEXITCODE -ne 0) {
    throw "La suite de integración falló."
  }
}
finally {
  if ([string]::IsNullOrWhiteSpace($originalDatabaseUrl)) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:DATABASE_URL = $originalDatabaseUrl
  }
}
