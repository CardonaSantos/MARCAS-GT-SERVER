/*
  Warnings:

  - A unique constraint covering the columns `[claveIdempotencia]` on the table `Pago` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `PagoAplicacion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `PagoComprobante` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EstadoPagoAplicacion" AS ENUM ('ACTIVA', 'REVERSADA');

-- CreateEnum
CREATE TYPE "TipoEventoPago" AS ENUM ('CREADO', 'COMPROBANTE_AGREGADO', 'VERIFICADO', 'RECHAZADO', 'APLICADO', 'APLICACION_REVERTIDA', 'ANULADO', 'OBSERVACION');

-- DropForeignKey
ALTER TABLE "PagoAplicacion" DROP CONSTRAINT "PagoAplicacion_cuentaPorCobrarId_fkey";

-- DropForeignKey
ALTER TABLE "PagoAplicacion" DROP CONSTRAINT "PagoAplicacion_pagoId_fkey";

-- DropIndex
DROP INDEX "PagoAplicacion_cuentaPorCobrarId_idx";

-- DropIndex
DROP INDEX "PagoAplicacion_pagoId_cuentaPorCobrarId_key";

-- DropIndex
DROP INDEX "PagoComprobante_pagoId_idx";

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'GTQ',
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "rechazadoEn" TIMESTAMP(3),
ADD COLUMN     "rechazadoPorId" INTEGER,
ADD COLUMN     "verificadoPorId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PagoAplicacion" ADD COLUMN     "aplicadoPorId" INTEGER,
ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "estado" "EstadoPagoAplicacion" NOT NULL DEFAULT 'ACTIVA',
ADD COLUMN     "motivoReversion" TEXT,
ADD COLUMN     "revertidaEn" TIMESTAMP(3),
ADD COLUMN     "revertidaPorId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PagoComprobante" ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "subidoPorId" INTEGER;

-- CreateTable
CREATE TABLE "PagoEvento" (
    "id" SERIAL NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoPago" NOT NULL,
    "estado" "EstadoPagoTransaccion" NOT NULL,
    "detalle" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "claveIdempotencia" TEXT,
    "metadata" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PagoEvento_claveIdempotencia_key" ON "PagoEvento"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "PagoEvento_pagoId_creadoEn_idx" ON "PagoEvento"("pagoId", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoEvento_tipo_creadoEn_idx" ON "PagoEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoEvento_estado_creadoEn_idx" ON "PagoEvento"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoEvento_usuarioId_creadoEn_idx" ON "PagoEvento"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoEvento_referenciaTipo_referenciaId_idx" ON "PagoEvento"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_claveIdempotencia_key" ON "Pago"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "Pago_pedidoId_fechaPago_idx" ON "Pago"("pedidoId", "fechaPago");

-- CreateIndex
CREATE INDEX "Pago_bancoId_fechaPago_idx" ON "Pago"("bancoId", "fechaPago");

-- CreateIndex
CREATE INDEX "Pago_empresaId_referencia_idx" ON "Pago"("empresaId", "referencia");

-- CreateIndex
CREATE INDEX "Pago_registradoPorId_fechaPago_idx" ON "Pago"("registradoPorId", "fechaPago");

-- CreateIndex
CREATE INDEX "Pago_verificadoPorId_verificadoEn_idx" ON "Pago"("verificadoPorId", "verificadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "PagoAplicacion_claveIdempotencia_key" ON "PagoAplicacion"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "PagoAplicacion_pagoId_estado_idx" ON "PagoAplicacion"("pagoId", "estado");

-- CreateIndex
CREATE INDEX "PagoAplicacion_cuentaPorCobrarId_estado_idx" ON "PagoAplicacion"("cuentaPorCobrarId", "estado");

-- CreateIndex
CREATE INDEX "PagoAplicacion_aplicadoPorId_creadoEn_idx" ON "PagoAplicacion"("aplicadoPorId", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoAplicacion_revertidaPorId_revertidaEn_idx" ON "PagoAplicacion"("revertidaPorId", "revertidaEn");

-- CreateIndex
CREATE UNIQUE INDEX "PagoComprobante_claveIdempotencia_key" ON "PagoComprobante"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "PagoComprobante_pagoId_creadoEn_idx" ON "PagoComprobante"("pagoId", "creadoEn");

-- CreateIndex
CREATE INDEX "PagoComprobante_subidoPorId_creadoEn_idx" ON "PagoComprobante"("subidoPorId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_verificadoPorId_fkey" FOREIGN KEY ("verificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_rechazadoPorId_fkey" FOREIGN KEY ("rechazadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoComprobante" ADD CONSTRAINT "PagoComprobante_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoEvento" ADD CONSTRAINT "PagoEvento_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoEvento" ADD CONSTRAINT "PagoEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_cuentaPorCobrarId_fkey" FOREIGN KEY ("cuentaPorCobrarId") REFERENCES "CuentaPorCobrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_aplicadoPorId_fkey" FOREIGN KEY ("aplicadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_revertidaPorId_fkey" FOREIGN KEY ("revertidaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ============================================================================
-- CHECK CONSTRAINTS - PAGOS V1
-- ============================================================================

-- ============================================================================
-- PAGO
-- ============================================================================

ALTER TABLE "Pago"
ADD CONSTRAINT "Pago_monto_check"
CHECK ("monto" > 0),

ADD CONSTRAINT "Pago_version_check"
CHECK ("version" >= 0),

ADD CONSTRAINT "Pago_moneda_check"
CHECK (length(trim("moneda")) > 0),

ADD CONSTRAINT "Pago_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- ============================================================================
-- ESTADOS / AUDITORIA DE PAGO
-- ============================================================================
-- NOT VALID evita romper registros históricos.
-- PostgreSQL sí aplicará estos CHECKS a registros nuevos.
-- Más adelante podrán validarse completamente después de sanear legacy.

ALTER TABLE "Pago"
ADD CONSTRAINT "Pago_verificado_check"
CHECK (
  "estado" <> 'VERIFICADO'
  OR (
    "verificadoEn" IS NOT NULL
    AND "verificadoPorId" IS NOT NULL
  )
) NOT VALID;

ALTER TABLE "Pago"
ADD CONSTRAINT "Pago_rechazado_check"
CHECK (
  "estado" <> 'RECHAZADO'
  OR (
    "rechazadoEn" IS NOT NULL
    AND "rechazadoPorId" IS NOT NULL
    AND "motivoRechazo" IS NOT NULL
    AND length(trim("motivoRechazo")) > 0
  )
) NOT VALID;

ALTER TABLE "Pago"
ADD CONSTRAINT "Pago_anulado_check"
CHECK (
  "estado" <> 'ANULADO'
  OR (
    "verificadoEn" IS NOT NULL
    AND "verificadoPorId" IS NOT NULL
    AND "anuladoEn" IS NOT NULL
    AND "anuladoPorId" IS NOT NULL
    AND "motivoAnulacion" IS NOT NULL
    AND length(trim("motivoAnulacion")) > 0
  )
) NOT VALID;


-- ============================================================================
-- PAGO APLICACION
-- ============================================================================

ALTER TABLE "PagoAplicacion"
ADD CONSTRAINT "PagoAplicacion_monto_check"
CHECK ("monto" > 0),

ADD CONSTRAINT "PagoAplicacion_version_check"
CHECK ("version" >= 0),

ADD CONSTRAINT "PagoAplicacion_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- Una aplicación REVERSADA debe conservar quién, cuándo y por qué.
ALTER TABLE "PagoAplicacion"
ADD CONSTRAINT "PagoAplicacion_reversion_check"
CHECK (
  "estado" <> 'REVERSADA'
  OR (
    "revertidaEn" IS NOT NULL
    AND "revertidaPorId" IS NOT NULL
    AND "motivoReversion" IS NOT NULL
    AND length(trim("motivoReversion")) > 0
  )
);


-- ============================================================================
-- PAGO COMPROBANTE
-- ============================================================================

ALTER TABLE "PagoComprobante"
ADD CONSTRAINT "PagoComprobante_size_check"
CHECK (
  "size" IS NULL
  OR "size" >= 0
),

ADD CONSTRAINT "PagoComprobante_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- ============================================================================
-- PAGO EVENTO
-- ============================================================================

ALTER TABLE "PagoEvento"
ADD CONSTRAINT "PagoEvento_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);