/*
  Warnings:

  - Added the required column `actualizadoEn` to the `TransferenciaBodegaDetalle` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoOperacionTransferenciaBodega" AS ENUM ('SALIDA', 'RECEPCION');

-- CreateEnum
CREATE TYPE "EstadoOperacionTransferenciaBodega" AS ENUM ('PENDIENTE', 'APLICADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "TipoEventoTransferenciaBodega" AS ENUM ('CREADA', 'ACTUALIZADA', 'PREPARADA', 'SALIDA_REGISTRADA', 'RECEPCION_REGISTRADA', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'CANCELADA', 'OPERACION_FALLIDA', 'OBSERVACION');

-- AlterTable
ALTER TABLE "TransferenciaBodega" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "motivoCancelacion" TEXT,
ADD COLUMN     "preparadaEn" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TransferenciaBodegaDetalle"
ADD COLUMN "actualizadoEn" TIMESTAMP(3),
ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "observaciones" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Backfill seguro para registros preexistentes
UPDATE "TransferenciaBodegaDetalle"
SET "actualizadoEn" = "creadoEn"
WHERE "actualizadoEn" IS NULL;

-- Después del backfill ya puede convertirse en obligatorio
ALTER TABLE "TransferenciaBodegaDetalle"
ALTER COLUMN "actualizadoEn" SET NOT NULL;

-- CreateTable
CREATE TABLE "TransferenciaBodegaEvento" (
    "id" SERIAL NOT NULL,
    "transferenciaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoTransferenciaBodega" NOT NULL,
    "detalle" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaBodegaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaBodegaOperacionDetalle" (
    "id" SERIAL NOT NULL,
    "operacionId" INTEGER NOT NULL,
    "transferenciaDetalleId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(14,4),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaBodegaOperacionDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaBodegaOperacion" (
    "id" SERIAL NOT NULL,
    "transferenciaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoOperacionTransferenciaBodega" NOT NULL,
    "estado" "EstadoOperacionTransferenciaBodega" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "documentoReferencia" TEXT,
    "observaciones" TEXT,
    "ocurridaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadaEn" TIMESTAMP(3),
    "errorAplicacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferenciaBodegaOperacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferenciaBodegaEvento_transferenciaId_creadoEn_idx" ON "TransferenciaBodegaEvento"("transferenciaId", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaEvento_usuarioId_idx" ON "TransferenciaBodegaEvento"("usuarioId");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaEvento_tipo_creadoEn_idx" ON "TransferenciaBodegaEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaOperacionDetalle_transferenciaDetalleId_idx" ON "TransferenciaBodegaOperacionDetalle"("transferenciaDetalleId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaBodegaOperacionDetalle_operacionId_transferenc_key" ON "TransferenciaBodegaOperacionDetalle"("operacionId", "transferenciaDetalleId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaBodegaOperacion_claveIdempotencia_key" ON "TransferenciaBodegaOperacion"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaOperacion_transferenciaId_ocurridaEn_idx" ON "TransferenciaBodegaOperacion"("transferenciaId", "ocurridaEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaOperacion_transferenciaId_tipo_estado_idx" ON "TransferenciaBodegaOperacion"("transferenciaId", "tipo", "estado");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaOperacion_usuarioId_ocurridaEn_idx" ON "TransferenciaBodegaOperacion"("usuarioId", "ocurridaEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaOperacion_estado_creadoEn_idx" ON "TransferenciaBodegaOperacion"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodega_creadoPorId_creadoEn_idx" ON "TransferenciaBodega"("creadoPorId", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodega_estado_creadoEn_idx" ON "TransferenciaBodega"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaBodegaDetalle_productoId_idx" ON "TransferenciaBodegaDetalle"("productoId");

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaEvento" ADD CONSTRAINT "TransferenciaBodegaEvento_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaBodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaEvento" ADD CONSTRAINT "TransferenciaBodegaEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaOperacionDetalle" ADD CONSTRAINT "TransferenciaBodegaOperacionDetalle_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "TransferenciaBodegaOperacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaOperacionDetalle" ADD CONSTRAINT "TransferenciaBodegaOperacionDetalle_transferenciaDetalleId_fkey" FOREIGN KEY ("transferenciaDetalleId") REFERENCES "TransferenciaBodegaDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaOperacion" ADD CONSTRAINT "TransferenciaBodegaOperacion_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaBodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaBodegaOperacion" ADD CONSTRAINT "TransferenciaBodegaOperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- CHECK CONSTRAINTS - TRANSFERENCIA BODEGA
-- ============================================================================

ALTER TABLE "TransferenciaBodega"
ADD CONSTRAINT "TransferenciaBodega_origen_destino_distintos"
CHECK (
  "bodegaOrigenId" <> "bodegaDestinoId"
);

ALTER TABLE "TransferenciaBodega"
ADD CONSTRAINT "TransferenciaBodega_version_no_negativa"
CHECK (
  "version" >= 0
);


-- ============================================================================
-- CHECK CONSTRAINTS - TRANSFERENCIA BODEGA DETALLE
-- ============================================================================

ALTER TABLE "TransferenciaBodegaDetalle"
ADD CONSTRAINT "TransferenciaBodegaDetalle_cantidades_validas"
CHECK (
  "cantidadSolicitada" > 0
  AND "cantidadEnviada" >= 0
  AND "cantidadRecibida" >= 0
  AND "cantidadEnviada" <= "cantidadSolicitada"
  AND "cantidadRecibida" <= "cantidadEnviada"
);

ALTER TABLE "TransferenciaBodegaDetalle"
ADD CONSTRAINT "TransferenciaBodegaDetalle_version_no_negativa"
CHECK (
  "version" >= 0
);


-- ============================================================================
-- CHECK CONSTRAINTS - OPERACION DE TRANSFERENCIA
-- ============================================================================

ALTER TABLE "TransferenciaBodegaOperacion"
ADD CONSTRAINT "TransferenciaBodegaOperacion_idempotencia_no_vacia"
CHECK (
  LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "TransferenciaBodegaOperacion"
ADD CONSTRAINT "TransferenciaBodegaOperacion_version_no_negativa"
CHECK (
  "version" >= 0
);


-- ============================================================================
-- CHECK CONSTRAINTS - DETALLE DE OPERACION DE TRANSFERENCIA
-- ============================================================================

ALTER TABLE "TransferenciaBodegaOperacionDetalle"
ADD CONSTRAINT "TransferenciaBodegaOperacionDetalle_cantidad_positiva"
CHECK (
  "cantidad" > 0
);

ALTER TABLE "TransferenciaBodegaOperacionDetalle"
ADD CONSTRAINT "TransferenciaBodegaOperacionDetalle_costo_valido"
CHECK (
  "costoUnitario" IS NULL
  OR "costoUnitario" >= 0
);
