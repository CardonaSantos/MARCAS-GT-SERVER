/*
  Warnings:

  - A unique constraint covering the columns `[numero]` on the table `Credito` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[solicitudId]` on the table `DecisionCredito` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `DecisionCredito` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[numero]` on the table `SolicitudCredito` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actualizadoEn` to the `DocumentoCredito` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `PoliticaCreditoRequisito` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadoEn` to the `ReferenciaCredito` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EstadoRequisitoSolicitudCredito" AS ENUM ('PENDIENTE', 'CUMPLIDO', 'NO_CUMPLE', 'EXONERADO');

-- CreateEnum
CREATE TYPE "TipoEventoSolicitudCredito" AS ENUM ('CREADA', 'ACTUALIZADA', 'ENVIADA_REVISION', 'REFERENCIA_AGREGADA', 'REFERENCIA_ACTUALIZADA', 'REFERENCIA_VERIFICADA', 'DOCUMENTO_AGREGADO', 'DOCUMENTO_VALIDADO', 'DOCUMENTO_RECHAZADO', 'REQUISITO_ACTUALIZADO', 'APROBADA', 'APROBADA_AJUSTADA', 'RECHAZADA', 'CANCELADA', 'CREDITO_CREADO', 'INTEGRACION_PEDIDO_APLICADA', 'INTEGRACION_PEDIDO_FALLIDA', 'OBSERVACION');

-- CreateEnum
CREATE TYPE "TipoOperacionIntegracionCreditoPedido" AS ENUM ('APROBACION', 'RECHAZO');

-- CreateEnum
CREATE TYPE "EstadoOperacionIntegracionCreditoPedido" AS ENUM ('PENDIENTE', 'APLICADA', 'FALLIDA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoPedido" ADD VALUE 'CREDITO_APROBADO';
ALTER TYPE "TipoEventoPedido" ADD VALUE 'CREDITO_RECHAZADO';

-- DropForeignKey
ALTER TABLE "SolicitudCredito" DROP CONSTRAINT "SolicitudCredito_pedidoId_fkey";

-- DropIndex
DROP INDEX "SolicitudCredito_clienteId_idx";

-- DropIndex
DROP INDEX "SolicitudCredito_pedidoId_idx";

-- AlterTable
ALTER TABLE "Credito" ADD COLUMN     "anticipoRequerido" DECIMAL(12,2),
ADD COLUMN     "aprobadoEn" TIMESTAMP(3),
ADD COLUMN     "aprobadoPorId" INTEGER,
ADD COLUMN     "cerradoEn" TIMESTAMP(3),
ADD COLUMN     "montoAutorizado" DECIMAL(12,2),
ADD COLUMN     "montoFinanciado" DECIMAL(12,2),
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "plazoAutorizadoDias" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';

-- AlterTable
ALTER TABLE "DecisionCredito" ADD COLUMN     "claveIdempotencia" TEXT;

-- AlterTable
ALTER TABLE "DocumentoCredito"
ADD COLUMN     "actualizadoEn" TIMESTAMP(3),
ADD COLUMN     "revisadoEn" TIMESTAMP(3),
ADD COLUMN     "revisadoPorId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "DocumentoCredito"
SET "actualizadoEn" = COALESCE("creadoEn", CURRENT_TIMESTAMP)
WHERE "actualizadoEn" IS NULL;

ALTER TABLE "DocumentoCredito"
ALTER COLUMN "actualizadoEn" SET NOT NULL;



-- AlterTable
ALTER TABLE "PoliticaCredito" ADD COLUMN     "inactivadaEn" TIMESTAMP(3),
ADD COLUMN     "motivoInactivacion" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PoliticaCreditoRequisito"
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizadoEn" TIMESTAMP(3),
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "PoliticaCreditoRequisito"
SET "actualizadoEn" = "creadoEn"
WHERE "actualizadoEn" IS NULL;

ALTER TABLE "PoliticaCreditoRequisito"
ALTER COLUMN "actualizadoEn" SET NOT NULL;



-- AlterTable
ALTER TABLE "ReferenciaCredito"
ADD COLUMN     "actualizadoEn" TIMESTAMP(3),
ADD COLUMN     "verificadoPorId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "ReferenciaCredito"
SET "actualizadoEn" = COALESCE("creadoEn", CURRENT_TIMESTAMP)
WHERE "actualizadoEn" IS NULL;

ALTER TABLE "ReferenciaCredito"
ALTER COLUMN "actualizadoEn" SET NOT NULL;


-- AlterTable
ALTER TABLE "SolicitudCredito" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "enRevisionEn" TIMESTAMP(3),
ADD COLUMN     "motivoCancelacion" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SolicitudCreditoRequisito" (
    "id" SERIAL NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "politicaRequisitoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoRequisitoSolicitudCredito" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,
    "revisadoPorId" INTEGER,
    "revisadoEn" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudCreditoRequisito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudCreditoEvento" (
    "id" SERIAL NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoSolicitudCredito" NOT NULL,
    "detalle" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudCreditoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacionIntegracionCreditoPedido" (
    "id" SERIAL NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "tipo" "TipoOperacionIntegracionCreditoPedido" NOT NULL,
    "estado" "EstadoOperacionIntegracionCreditoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadaEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperacionIntegracionCreditoPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudCreditoRequisito_solicitudId_estado_idx" ON "SolicitudCreditoRequisito"("solicitudId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudCreditoRequisito_politicaRequisitoId_idx" ON "SolicitudCreditoRequisito"("politicaRequisitoId");

-- CreateIndex
CREATE INDEX "SolicitudCreditoRequisito_revisadoPorId_idx" ON "SolicitudCreditoRequisito"("revisadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudCreditoRequisito_solicitudId_codigo_key" ON "SolicitudCreditoRequisito"("solicitudId", "codigo");

-- CreateIndex
CREATE INDEX "SolicitudCreditoEvento_solicitudId_creadoEn_idx" ON "SolicitudCreditoEvento"("solicitudId", "creadoEn");

-- CreateIndex
CREATE INDEX "SolicitudCreditoEvento_usuarioId_idx" ON "SolicitudCreditoEvento"("usuarioId");

-- CreateIndex
CREATE INDEX "SolicitudCreditoEvento_tipo_creadoEn_idx" ON "SolicitudCreditoEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "SolicitudCreditoEvento_referenciaTipo_referenciaId_idx" ON "SolicitudCreditoEvento"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionIntegracionCreditoPedido_solicitudId_key" ON "OperacionIntegracionCreditoPedido"("solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionIntegracionCreditoPedido_claveIdempotencia_key" ON "OperacionIntegracionCreditoPedido"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "OperacionIntegracionCreditoPedido_pedidoId_estado_idx" ON "OperacionIntegracionCreditoPedido"("pedidoId", "estado");

-- CreateIndex
CREATE INDEX "OperacionIntegracionCreditoPedido_estado_creadoEn_idx" ON "OperacionIntegracionCreditoPedido"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "OperacionIntegracionCreditoPedido_actorId_idx" ON "OperacionIntegracionCreditoPedido"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Credito_numero_key" ON "Credito"("numero");

-- CreateIndex
CREATE INDEX "Credito_empresaId_estado_createdAt_idx" ON "Credito"("empresaId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "Credito_clienteId_estado_idx" ON "Credito"("clienteId", "estado");

-- CreateIndex
CREATE INDEX "Credito_aprobadoPorId_idx" ON "Credito"("aprobadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCredito_solicitudId_key" ON "DecisionCredito"("solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCredito_claveIdempotencia_key" ON "DecisionCredito"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "DocumentoCredito_solicitudId_estado_idx" ON "DocumentoCredito"("solicitudId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoCredito_revisadoPorId_idx" ON "DocumentoCredito"("revisadoPorId");

-- CreateIndex
CREATE INDEX "PoliticaCreditoRequisito_politicaId_activo_orden_idx" ON "PoliticaCreditoRequisito"("politicaId", "activo", "orden");

-- CreateIndex
CREATE INDEX "ReferenciaCredito_solicitudId_creadoEn_idx" ON "ReferenciaCredito"("solicitudId", "creadoEn");

-- CreateIndex
CREATE INDEX "ReferenciaCredito_verificadoPorId_idx" ON "ReferenciaCredito"("verificadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudCredito_numero_key" ON "SolicitudCredito"("numero");

-- CreateIndex
CREATE INDEX "SolicitudCredito_pedidoId_estado_idx" ON "SolicitudCredito"("pedidoId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudCredito_clienteId_estado_solicitadaEn_idx" ON "SolicitudCredito"("clienteId", "estado", "solicitadaEn");

-- CreateIndex
CREATE INDEX "SolicitudCredito_solicitanteId_estado_solicitadaEn_idx" ON "SolicitudCredito"("solicitanteId", "estado", "solicitadaEn");

-- CreateIndex
CREATE INDEX "SolicitudCredito_politicaId_estado_idx" ON "SolicitudCredito"("politicaId", "estado");

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCreditoRequisito" ADD CONSTRAINT "SolicitudCreditoRequisito_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCreditoRequisito" ADD CONSTRAINT "SolicitudCreditoRequisito_politicaRequisitoId_fkey" FOREIGN KEY ("politicaRequisitoId") REFERENCES "PoliticaCreditoRequisito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCreditoRequisito" ADD CONSTRAINT "SolicitudCreditoRequisito_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCreditoEvento" ADD CONSTRAINT "SolicitudCreditoEvento_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCreditoEvento" ADD CONSTRAINT "SolicitudCreditoEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionIntegracionCreditoPedido" ADD CONSTRAINT "OperacionIntegracionCreditoPedido_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionIntegracionCreditoPedido" ADD CONSTRAINT "OperacionIntegracionCreditoPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionIntegracionCreditoPedido" ADD CONSTRAINT "OperacionIntegracionCreditoPedido_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenciaCredito" ADD CONSTRAINT "ReferenciaCredito_verificadoPorId_fkey" FOREIGN KEY ("verificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoCredito" ADD CONSTRAINT "DocumentoCredito_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ADICION DE SQL 4
-- APPEND al final de la migración generada por Prisma.

ALTER TABLE "PoliticaCredito"
ADD CONSTRAINT "PoliticaCredito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "PoliticaCredito"
ADD CONSTRAINT "PoliticaCredito_monto_maximo_valido"
CHECK ("montoMaximo" IS NULL OR "montoMaximo" > 0);

ALTER TABLE "PoliticaCredito"
ADD CONSTRAINT "PoliticaCredito_plazo_maximo_valido"
CHECK ("plazoMaximoDias" IS NULL OR "plazoMaximoDias" > 0);

ALTER TABLE "PoliticaCredito"
ADD CONSTRAINT "PoliticaCredito_anticipo_porcentaje_valido"
CHECK (
  "porcentajeAnticipo" IS NULL
  OR ("porcentajeAnticipo" >= 0 AND "porcentajeAnticipo" <= 100)
);

ALTER TABLE "PoliticaCredito"
ADD CONSTRAINT "PoliticaCredito_motivo_inactivacion_valido"
CHECK (
  "motivoInactivacion" IS NULL
  OR LENGTH(TRIM("motivoInactivacion")) >= 3
);

ALTER TABLE "PoliticaCreditoRequisito"
ADD CONSTRAINT "PoliticaCreditoRequisito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "PoliticaCreditoRequisito"
ADD CONSTRAINT "PoliticaCreditoRequisito_orden_no_negativo"
CHECK ("orden" >= 0);

ALTER TABLE "PoliticaCreditoRequisito"
ADD CONSTRAINT "PoliticaCreditoRequisito_codigo_no_vacio"
CHECK (LENGTH(TRIM("codigo")) > 0);

ALTER TABLE "PoliticaCreditoRequisito"
ADD CONSTRAINT "PoliticaCreditoRequisito_nombre_no_vacio"
CHECK (LENGTH(TRIM("nombre")) > 0);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_monto_positivo"
CHECK ("montoSolicitado" > 0);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_plazo_positivo"
CHECK ("plazoDias" > 0);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_anticipo_valido"
CHECK (
  "anticipoPropuesto" >= 0
  AND "anticipoPropuesto" <= "montoSolicitado"
);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_numero_no_vacio"
CHECK ("numero" IS NULL OR LENGTH(TRIM("numero")) > 0);

ALTER TABLE "SolicitudCredito"
ADD CONSTRAINT "SolicitudCredito_motivo_cancelacion_valido"
CHECK (
  "motivoCancelacion" IS NULL
  OR LENGTH(TRIM("motivoCancelacion")) >= 3
);

CREATE UNIQUE INDEX "SolicitudCredito_pedido_activa_key"
ON "SolicitudCredito"("pedidoId")
WHERE "estado" IN ('PENDIENTE', 'EN_REVISION', 'APROBADA');

ALTER TABLE "SolicitudCreditoRequisito"
ADD CONSTRAINT "SolicitudCreditoRequisito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "SolicitudCreditoRequisito"
ADD CONSTRAINT "SolicitudCreditoRequisito_orden_no_negativo"
CHECK ("orden" >= 0);

ALTER TABLE "SolicitudCreditoRequisito"
ADD CONSTRAINT "SolicitudCreditoRequisito_codigo_no_vacio"
CHECK (LENGTH(TRIM("codigo")) > 0);

ALTER TABLE "SolicitudCreditoRequisito"
ADD CONSTRAINT "SolicitudCreditoRequisito_nombre_no_vacio"
CHECK (LENGTH(TRIM("nombre")) > 0);

ALTER TABLE "SolicitudCreditoRequisito"
ADD CONSTRAINT "SolicitudCreditoRequisito_revision_consistente"
CHECK (
  (
    "estado" = 'PENDIENTE'
    AND "revisadoPorId" IS NULL
    AND "revisadoEn" IS NULL
  )
  OR
  (
    "estado" <> 'PENDIENTE'
    AND "revisadoPorId" IS NOT NULL
    AND "revisadoEn" IS NOT NULL
  )
);

ALTER TABLE "ReferenciaCredito"
ADD CONSTRAINT "ReferenciaCredito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "ReferenciaCredito"
ADD CONSTRAINT "ReferenciaCredito_nombre_no_vacio"
CHECK (LENGTH(TRIM("nombre")) > 0);

ALTER TABLE "ReferenciaCredito"
ADD CONSTRAINT "ReferenciaCredito_telefono_no_vacio"
CHECK (LENGTH(TRIM("telefono")) > 0);

ALTER TABLE "DocumentoCredito"
ADD CONSTRAINT "DocumentoCredito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "DocumentoCredito"
ADD CONSTRAINT "DocumentoCredito_size_valido"
CHECK ("size" IS NULL OR "size" >= 0);

ALTER TABLE "DocumentoCredito"
ADD CONSTRAINT "DocumentoCredito_url_no_vacia"
CHECK (LENGTH(TRIM("url")) > 0);

ALTER TABLE "DecisionCredito"
ADD CONSTRAINT "DecisionCredito_finanzas_consistentes"
CHECK (
  (
    "tipo" IN ('APROBADA', 'AJUSTADA')
    AND "montoAutorizado" IS NOT NULL
    AND "montoAutorizado" > 0
    AND "plazoAutorizadoDias" IS NOT NULL
    AND "plazoAutorizadoDias" > 0
    AND "anticipoRequerido" IS NOT NULL
    AND "anticipoRequerido" >= 0
    AND "anticipoRequerido" <= "montoAutorizado"
  )
  OR
  (
    "tipo" = 'RECHAZADA'
    AND "montoAutorizado" IS NULL
    AND "plazoAutorizadoDias" IS NULL
    AND "anticipoRequerido" IS NULL
  )
);

ALTER TABLE "DecisionCredito"
ADD CONSTRAINT "DecisionCredito_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "SolicitudCreditoEvento"
ADD CONSTRAINT "SolicitudCreditoEvento_referencia_consistente"
CHECK (
  (
    "referenciaTipo" IS NULL
    AND "referenciaId" IS NULL
  )
  OR
  (
    "referenciaTipo" IS NOT NULL
    AND LENGTH(TRIM("referenciaTipo")) > 0
    AND "referenciaId" IS NOT NULL
    AND "referenciaId" > 0
  )
);

ALTER TABLE "OperacionIntegracionCreditoPedido"
ADD CONSTRAINT "OperacionIntegracionCreditoPedido_intentos_no_negativos"
CHECK ("intentos" >= 0);

ALTER TABLE "OperacionIntegracionCreditoPedido"
ADD CONSTRAINT "OperacionIntegracionCreditoPedido_clave_no_vacia"
CHECK (LENGTH(TRIM("claveIdempotencia")) > 0);

ALTER TABLE "OperacionIntegracionCreditoPedido"
ADD CONSTRAINT "OperacionIntegracionCreditoPedido_estado_consistente"
CHECK (
  ("estado" = 'APLICADA' AND "aplicadaEn" IS NOT NULL)
  OR
  ("estado" IN ('PENDIENTE', 'FALLIDA') AND "aplicadaEn" IS NULL)
);

ALTER TABLE "OperacionIntegracionCreditoPedido"
ADD CONSTRAINT "OperacionIntegracionCreditoPedido_error_fallida"
CHECK (
  "estado" <> 'FALLIDA'
  OR (
    "ultimoError" IS NOT NULL
    AND LENGTH(TRIM("ultimoError")) > 0
  )
);

ALTER TABLE "Credito"
ADD CONSTRAINT "Credito_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "Credito"
ADD CONSTRAINT "Credito_numero_no_vacio"
CHECK ("numero" IS NULL OR LENGTH(TRIM("numero")) > 0);

ALTER TABLE "Credito"
ADD CONSTRAINT "Credito_moderno_consistente"
CHECK (
  (
    "montoAutorizado" IS NULL
    AND "anticipoRequerido" IS NULL
    AND "montoFinanciado" IS NULL
    AND "plazoAutorizadoDias" IS NULL
    AND "aprobadoPorId" IS NULL
    AND "aprobadoEn" IS NULL
  )
  OR
  (
    "montoAutorizado" IS NOT NULL
    AND "montoAutorizado" > 0
    AND "anticipoRequerido" IS NOT NULL
    AND "anticipoRequerido" >= 0
    AND "anticipoRequerido" <= "montoAutorizado"
    AND "montoFinanciado" IS NOT NULL
    AND "montoFinanciado" = "montoAutorizado" - "anticipoRequerido"
    AND "plazoAutorizadoDias" IS NOT NULL
    AND "plazoAutorizadoDias" > 0
    AND "aprobadoPorId" IS NOT NULL
    AND "aprobadoEn" IS NOT NULL
  )
);
