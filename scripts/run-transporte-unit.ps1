$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Transporte V1 - Fase 1: Jest unit/application" -ForegroundColor Cyan
Write-Host ""

npx jest modules/transporte --runInBand

if ($LASTEXITCODE -ne 0) {
  throw "La suite unitaria/application de Transporte falló."
}

Write-Host ""
Write-Host "Fase 1 de Transporte aprobada." -ForegroundColor Green
