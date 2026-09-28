/*
  Warnings:

  - You are about to drop the column `metadata` on the `BodegaEvento` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `PedidoEvento` table. All the data in the column will be lost.
  - You are about to drop the column `costoEstimado` on the `RequisicionDetalle` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoEventoRequisicion" AS ENUM ('CREADA', 'ACTUALIZADA', 'SOLICITADA', 'APROBADA', 'RECHAZADA', 'RECEPCION_REGISTRADA', 'COMPLETADA', 'CANCELADA', 'OBSERVACION');

-- CreateEnum
CREATE TYPE "EstadoRecepcionRequisicion" AS ENUM ('PENDIENTE', 'APLICADA', 'FALLIDA');

-- DropIndex
DROP INDEX "Requisicion_bodegaDestinoId_idx";

-- AlterTable
ALTER TABLE "BodegaEvento" DROP COLUMN "metadata";

-- AlterTable
ALTER TABLE "PedidoEvento" DROP COLUMN "metadata";

-- AlterTable
ALTER TABLE "Requisicion" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "motivoCancelacion" TEXT,
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "rechazadaEn" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable

ALTER TABLE "RequisicionDetalle"
RENAME COLUMN "costoEstimado" TO "costoUnitarioEstimado";

ALTER TABLE "RequisicionDetalle"
ALTER COLUMN "costoUnitarioEstimado" SET DATA TYPE DECIMAL(14,4),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RequisicionEvento" (
    "id" SERIAL NOT NULL,
    "requisicionId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoRequisicion" NOT NULL,
    "detalle" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequisicionEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionRequisicion" (
    "id" SERIAL NOT NULL,
    "requisicionId" INTEGER NOT NULL,
    "recibidoPorId" INTEGER NOT NULL,
    "estado" "EstadoRecepcionRequisicion" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "documentoReferencia" TEXT,
    "observaciones" TEXT,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadaEn" TIMESTAMP(3),
    "errorAplicacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecepcionRequisicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionRequisicionDetalle" (
    "id" SERIAL NOT NULL,
    "recepcionId" INTEGER NOT NULL,
    "requisicionDetalleId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(14,4) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecepcionRequisicionDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequisicionEvento_requisicionId_creadoEn_idx" ON "RequisicionEvento"("requisicionId", "creadoEn");

-- CreateIndex
CREATE INDEX "RequisicionEvento_usuarioId_idx" ON "RequisicionEvento"("usuarioId");

-- CreateIndex
CREATE INDEX "RequisicionEvento_tipo_creadoEn_idx" ON "RequisicionEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "RecepcionRequisicion_claveIdempotencia_key" ON "RecepcionRequisicion"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "RecepcionRequisicion_requisicionId_recibidoEn_idx" ON "RecepcionRequisicion"("requisicionId", "recibidoEn");

-- CreateIndex
CREATE INDEX "RecepcionRequisicion_recibidoPorId_recibidoEn_idx" ON "RecepcionRequisicion"("recibidoPorId", "recibidoEn");

-- CreateIndex
CREATE INDEX "RecepcionRequisicion_estado_creadoEn_idx" ON "RecepcionRequisicion"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "RecepcionRequisicionDetalle_requisicionDetalleId_idx" ON "RecepcionRequisicionDetalle"("requisicionDetalleId");

-- CreateIndex
CREATE UNIQUE INDEX "RecepcionRequisicionDetalle_recepcionId_requisicionDetalleI_key" ON "RecepcionRequisicionDetalle"("recepcionId", "requisicionDetalleId");

-- CreateIndex
CREATE INDEX "Requisicion_bodegaDestinoId_estado_idx" ON "Requisicion"("bodegaDestinoId", "estado");

-- CreateIndex
CREATE INDEX "Requisicion_proveedorId_estado_idx" ON "Requisicion"("proveedorId", "estado");

-- CreateIndex
CREATE INDEX "Requisicion_solicitanteId_creadoEn_idx" ON "Requisicion"("solicitanteId", "creadoEn");

-- CreateIndex
CREATE INDEX "Requisicion_estado_creadoEn_idx" ON "Requisicion"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "RequisicionDetalle_productoId_idx" ON "RequisicionDetalle"("productoId");

-- AddForeignKey
ALTER TABLE "RequisicionEvento" ADD CONSTRAINT "RequisicionEvento_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicionEvento" ADD CONSTRAINT "RequisicionEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionRequisicion" ADD CONSTRAINT "RecepcionRequisicion_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionRequisicion" ADD CONSTRAINT "RecepcionRequisicion_recibidoPorId_fkey" FOREIGN KEY ("recibidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionRequisicionDetalle" ADD CONSTRAINT "RecepcionRequisicionDetalle_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "RecepcionRequisicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionRequisicionDetalle" ADD CONSTRAINT "RecepcionRequisicionDetalle_requisicionDetalleId_fkey" FOREIGN KEY ("requisicionDetalleId") REFERENCES "RequisicionDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ULTIMOS AJUSTES AL FINAL

-- ============================================================
-- CHECK CONSTRAINTS - REQUISICION
-- ============================================================

ALTER TABLE "Requisicion"
ADD CONSTRAINT "Requisicion_version_no_negativa"
CHECK ("version" >= 0);


ALTER TABLE "RequisicionDetalle"
ADD CONSTRAINT "RequisicionDetalle_cantidades_validas"
CHECK (
  "cantidadSolicitada" > 0
  AND "cantidadRecibida" >= 0
  AND "cantidadRecibida" <= "cantidadSolicitada"
);

ALTER TABLE "RequisicionDetalle"
ADD CONSTRAINT "RequisicionDetalle_costo_estimado_valido"
CHECK (
  "costoUnitarioEstimado" IS NULL
  OR "costoUnitarioEstimado" >= 0
);

ALTER TABLE "RequisicionDetalle"
ADD CONSTRAINT "RequisicionDetalle_version_no_negativa"
CHECK ("version" >= 0);

-- ADICIONALES
-- ============================================================
-- CHECK CONSTRAINTS - RECEPCION REQUISICION
-- ============================================================

ALTER TABLE "RecepcionRequisicion"
ADD CONSTRAINT "RecepcionRequisicion_idempotencia_no_vacia"
CHECK (
  LENGTH(TRIM("claveIdempotencia")) > 0
);


-- ============================================================
-- CHECK CONSTRAINTS - RECEPCION REQUISICION DETALLE
-- ============================================================

ALTER TABLE "RecepcionRequisicionDetalle"
ADD CONSTRAINT "RecepcionRequisicionDetalle_cantidad_positiva"
CHECK (
  "cantidad" > 0
);

ALTER TABLE "RecepcionRequisicionDetalle"
ADD CONSTRAINT "RecepcionRequisicionDetalle_costo_valido"
CHECK (
  "costoUnitario" >= 0
);