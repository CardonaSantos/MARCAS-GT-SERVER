$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Transporte V1 - Fase 2: Read-side / Query / Tracking" -ForegroundColor Cyan
Write-Host ""

npx jest `
  "transport.prisma-query.adapter.spec.ts|tracking-directory.prisma-adapter.spec.ts" `
  --runInBand

if ($LASTEXITCODE -ne 0) {
  throw "La Fase 2 de Transporte fallo."
}

Write-Host ""
Write-Host "Fase 2 de Transporte aprobada." -ForegroundColor Green
