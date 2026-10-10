-- CreateEnum
CREATE TYPE "TipoEventoFactura" AS ENUM ('CREADA', 'ACTUALIZADA', 'PREPARADA', 'EMISION_SOLICITADA', 'EMITIDA', 'DESCARTADA', 'ANULACION_SOLICITADA', 'ANULADA', 'OBSERVACION');

-- AlterEnum
ALTER TYPE "EstadoFactura" ADD VALUE 'DESCARTADA';

-- AlterTable
ALTER TABLE "EmpresaPerfilFiscal" ADD COLUMN     "preciosIncluyenImpuestos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tasaIvaDefault" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "descartadaEn" TIMESTAMP(3),
ADD COLUMN     "motivoDescarte" TEXT;

-- AlterTable
ALTER TABLE "FacturaDetalleImpuesto" ADD COLUMN     "tasa" DECIMAL(7,4);

-- CreateTable
CREATE TABLE "FacturaEvento" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoFactura" NOT NULL,
    "estado" "EstadoFactura" NOT NULL,
    "detalle" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "claveIdempotencia" TEXT,
    "metadata" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacturaEvento_claveIdempotencia_key" ON "FacturaEvento"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "FacturaEvento_facturaId_creadoEn_idx" ON "FacturaEvento"("facturaId", "creadoEn");

-- CreateIndex
CREATE INDEX "FacturaEvento_tipo_creadoEn_idx" ON "FacturaEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "FacturaEvento_estado_creadoEn_idx" ON "FacturaEvento"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "FacturaEvento_usuarioId_creadoEn_idx" ON "FacturaEvento"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "FacturaEvento_referenciaTipo_referenciaId_idx" ON "FacturaEvento"("referenciaTipo", "referenciaId");

-- AddForeignKey
ALTER TABLE "FacturaEvento" ADD CONSTRAINT "FacturaEvento_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEvento" ADD CONSTRAINT "FacturaEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
