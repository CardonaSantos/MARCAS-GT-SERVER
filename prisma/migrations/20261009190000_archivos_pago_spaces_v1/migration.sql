-- Migración aditiva: conserva comprobantes existentes y su metadata.
-- La nueva carga privada guarda una key de Spaces en PagoComprobante.key.
ALTER TABLE "PagoComprobante"
  ADD COLUMN "eliminadoEn" TIMESTAMP(3),
  ADD COLUMN "eliminadoPorId" INTEGER;

CREATE INDEX "PagoComprobante_pagoId_eliminadoEn_idx"
  ON "PagoComprobante"("pagoId", "eliminadoEn");
