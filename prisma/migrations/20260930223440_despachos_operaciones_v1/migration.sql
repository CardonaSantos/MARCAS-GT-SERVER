-- CreateEnum
CREATE TYPE "TipoOperacionDespacho" AS ENUM ('RESERVA_PREPARACION', 'SALIDA_DESPACHO', 'LIBERACION_RESERVA');

-- CreateEnum
CREATE TYPE "EstadoOperacionDespacho" AS ENUM ('PENDIENTE', 'APLICANDO', 'APLICADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "EstadoDetalleOperacionDespacho" AS ENUM ('PENDIENTE', 'APLICADA', 'FALLIDA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoOrdenDespacho" ADD VALUE 'OPERACION_FALLIDA';
ALTER TYPE "TipoEventoOrdenDespacho" ADD VALUE 'OPERACION_REINTENTADA';

-- CreateTable
CREATE TABLE "OperacionDespacho" (
    "id" SERIAL NOT NULL,
    "ordenDespachoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoOperacionDespacho" NOT NULL,
    "estado" "EstadoOperacionDespacho" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "observaciones" TEXT,
    "ocurridaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEn" TIMESTAMP(3),
    "ultimoIntentoEn" TIMESTAMP(3),
    "aplicadaEn" TIMESTAMP(3),
    "fallidaEn" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errorAplicacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperacionDespacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacionDespachoDetalle" (
    "id" SERIAL NOT NULL,
    "operacionId" INTEGER NOT NULL,
    "ordenDespachoDetalleId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "estado" "EstadoDetalleOperacionDespacho" NOT NULL DEFAULT 'PENDIENTE',
    "reservaInventarioId" INTEGER,
    "movimientoInventarioId" INTEGER,
    "claveIdempotencia" TEXT NOT NULL,
    "aplicadaEn" TIMESTAMP(3),
    "errorAplicacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperacionDespachoDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperacionDespacho_claveIdempotencia_key" ON "OperacionDespacho"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "OperacionDespacho_ordenDespachoId_ocurridaEn_idx" ON "OperacionDespacho"("ordenDespachoId", "ocurridaEn");

-- CreateIndex
CREATE INDEX "OperacionDespacho_ordenDespachoId_tipo_estado_idx" ON "OperacionDespacho"("ordenDespachoId", "tipo", "estado");

-- CreateIndex
CREATE INDEX "OperacionDespacho_usuarioId_ocurridaEn_idx" ON "OperacionDespacho"("usuarioId", "ocurridaEn");

-- CreateIndex
CREATE INDEX "OperacionDespacho_estado_actualizadoEn_idx" ON "OperacionDespacho"("estado", "actualizadoEn");

-- CreateIndex
CREATE INDEX "OperacionDespacho_tipo_ocurridaEn_idx" ON "OperacionDespacho"("tipo", "ocurridaEn");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionDespachoDetalle_movimientoInventarioId_key" ON "OperacionDespachoDetalle"("movimientoInventarioId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionDespachoDetalle_claveIdempotencia_key" ON "OperacionDespachoDetalle"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "OperacionDespachoDetalle_ordenDespachoDetalleId_idx" ON "OperacionDespachoDetalle"("ordenDespachoDetalleId");

-- CreateIndex
CREATE INDEX "OperacionDespachoDetalle_estado_actualizadoEn_idx" ON "OperacionDespachoDetalle"("estado", "actualizadoEn");

-- CreateIndex
CREATE INDEX "OperacionDespachoDetalle_reservaInventarioId_idx" ON "OperacionDespachoDetalle"("reservaInventarioId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionDespachoDetalle_operacionId_ordenDespachoDetalleId_key" ON "OperacionDespachoDetalle"("operacionId", "ordenDespachoDetalleId");

-- AddForeignKey
ALTER TABLE "OperacionDespacho" ADD CONSTRAINT "OperacionDespacho_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionDespacho" ADD CONSTRAINT "OperacionDespacho_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionDespachoDetalle" ADD CONSTRAINT "OperacionDespachoDetalle_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "OperacionDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionDespachoDetalle" ADD CONSTRAINT "OperacionDespachoDetalle_ordenDespachoDetalleId_fkey" FOREIGN KEY ("ordenDespachoDetalleId") REFERENCES "OrdenDespachoDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADICION
-- ============================================================================
-- CHECKS: OperacionDespacho
-- ============================================================================

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_intentos_no_negativos"
CHECK ("intentos" >= 0);

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_clave_idempotencia_no_vacia"
CHECK (
  LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_aplicando_consistente"
CHECK (
  "estado" <> 'APLICANDO'
  OR "iniciadaEn" IS NOT NULL
);

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_aplicada_consistente"
CHECK (
  "estado" <> 'APLICADA'
  OR "aplicadaEn" IS NOT NULL
);

ALTER TABLE "OperacionDespacho"
ADD CONSTRAINT "OperacionDespacho_fallida_consistente"
CHECK (
  "estado" <> 'FALLIDA'
  OR (
    "fallidaEn" IS NOT NULL
    AND "errorAplicacion" IS NOT NULL
    AND LENGTH(TRIM("errorAplicacion")) > 0
  )
);


-- ============================================================================
-- CHECKS: OperacionDespachoDetalle
-- ============================================================================

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_cantidad_positiva"
CHECK (
  "cantidad" > 0
);

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_clave_idempotencia_no_vacia"
CHECK (
  LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_reserva_id_valido"
CHECK (
  "reservaInventarioId" IS NULL
  OR "reservaInventarioId" > 0
);

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_movimiento_id_valido"
CHECK (
  "movimientoInventarioId" IS NULL
  OR "movimientoInventarioId" > 0
);

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_aplicada_consistente"
CHECK (
  "estado" <> 'APLICADA'
  OR (
    "aplicadaEn" IS NOT NULL
    AND "reservaInventarioId" IS NOT NULL
    AND "movimientoInventarioId" IS NOT NULL
  )
);

ALTER TABLE "OperacionDespachoDetalle"
ADD CONSTRAINT "OperacionDespachoDetalle_fallida_consistente"
CHECK (
  "estado" <> 'FALLIDA'
  OR (
    "errorAplicacion" IS NOT NULL
    AND LENGTH(TRIM("errorAplicacion")) > 0
  )
);