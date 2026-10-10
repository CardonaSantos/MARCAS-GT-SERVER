/*
  Warnings:

  - The values [GPS] on the enum `TipoEvidenciaEntrega` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `firmaUrl` on the `Entrega` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `Entrega` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `EntregaEvidencia` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actualizadoEn` to the `EntregaDetalle` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoEventoEntrega" AS ENUM ('CREADA', 'INICIADA', 'ENTREGA_PARCIAL', 'ENTREGADA', 'RECHAZADA', 'NO_ENTREGADA', 'CANCELADA', 'EVIDENCIA_AGREGADA', 'OBSERVACION');

-- CreateEnum
CREATE TYPE "MotivoNoEntrega" AS ENUM ('CLIENTE_AUSENTE', 'DIRECCION_INCORRECTA', 'LOCAL_CERRADO', 'REPROGRAMADA', 'RECHAZO_CLIENTE', 'PROBLEMA_ACCESO', 'DOCUMENTACION', 'MERCADERIA_DANADA', 'OTRO');

-- AlterEnum
BEGIN;
CREATE TYPE "TipoEvidenciaEntrega_new" AS ENUM ('FIRMA', 'FOTO', 'DOCUMENTO', 'OTRO');
ALTER TABLE "EntregaEvidencia" ALTER COLUMN "tipo" TYPE "TipoEvidenciaEntrega_new" USING ("tipo"::text::"TipoEvidenciaEntrega_new");
ALTER TYPE "TipoEvidenciaEntrega" RENAME TO "TipoEvidenciaEntrega_old";
ALTER TYPE "TipoEvidenciaEntrega_new" RENAME TO "TipoEvidenciaEntrega";
DROP TYPE "TipoEvidenciaEntrega_old";
COMMIT;

-- DropIndex
DROP INDEX "Entrega_ordenDespachoId_idx";

-- AlterTable
ALTER TABLE "Entrega" DROP COLUMN "firmaUrl",
ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "detalleNoEntrega" TEXT,
ADD COLUMN     "finalizadaEn" TIMESTAMP(3),
ADD COLUMN     "iniciadaEn" TIMESTAMP(3),
ADD COLUMN     "motivoNoEntrega" "MotivoNoEntrega",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EntregaDetalle"
ADD COLUMN "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "cantidadEntregada" SET DEFAULT 0;

-- El default solamente se necesita para rellenar registros históricos.
-- Prisma administra este campo mediante @updatedAt.
ALTER TABLE "EntregaDetalle"
ALTER COLUMN "actualizadoEn" DROP DEFAULT;



-- AlterTable
ALTER TABLE "EntregaEvidencia" ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "descripcion" TEXT;

-- CreateTable
CREATE TABLE "EntregaEvento" (
    "id" SERIAL NOT NULL,
    "entregaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoEntrega" NOT NULL,
    "estado" "EstadoEntrega" NOT NULL,
    "detalle" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "claveIdempotencia" TEXT,
    "metadata" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntregaEvento_claveIdempotencia_key" ON "EntregaEvento"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "EntregaEvento_entregaId_creadoEn_idx" ON "EntregaEvento"("entregaId", "creadoEn");

-- CreateIndex
CREATE INDEX "EntregaEvento_tipo_creadoEn_idx" ON "EntregaEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "EntregaEvento_estado_creadoEn_idx" ON "EntregaEvento"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "EntregaEvento_usuarioId_creadoEn_idx" ON "EntregaEvento"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "EntregaEvento_referenciaTipo_referenciaId_idx" ON "EntregaEvento"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrega_claveIdempotencia_key" ON "Entrega"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "Entrega_ordenDespachoId_estado_idx" ON "Entrega"("ordenDespachoId", "estado");

-- CreateIndex
CREATE INDEX "Entrega_clienteId_estado_creadoEn_idx" ON "Entrega"("clienteId", "estado", "creadoEn");

-- CreateIndex
CREATE INDEX "Entrega_registradoPorId_creadoEn_idx" ON "Entrega"("registradoPorId", "creadoEn");

-- CreateIndex
CREATE INDEX "Entrega_estado_creadoEn_idx" ON "Entrega"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "EntregaDetalle_pedidoDetalleId_idx" ON "EntregaDetalle"("pedidoDetalleId");

-- CreateIndex
CREATE INDEX "EntregaDetalle_productoId_idx" ON "EntregaDetalle"("productoId");

-- CreateIndex
CREATE INDEX "EntregaDetalle_ordenDespachoDetalleId_idx" ON "EntregaDetalle"("ordenDespachoDetalleId");

-- CreateIndex
CREATE UNIQUE INDEX "EntregaEvidencia_claveIdempotencia_key" ON "EntregaEvidencia"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "EntregaEvidencia_entregaId_creadoEn_idx" ON "EntregaEvidencia"("entregaId", "creadoEn");

-- AddForeignKey
ALTER TABLE "EntregaEvento" ADD CONSTRAINT "EntregaEvento_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaEvento" ADD CONSTRAINT "EntregaEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- CHEKS
-- ============================================================================
-- CHECK CONSTRAINTS: ENTREGA
-- ============================================================================

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_clave_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_latitud_valida"
CHECK (
  "latitud" IS NULL
  OR ("latitud" >= -90 AND "latitud" <= 90)
);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_longitud_valida"
CHECK (
  "longitud" IS NULL
  OR ("longitud" >= -180 AND "longitud" <= 180)
);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_coordenadas_consistentes"
CHECK (
  ("latitud" IS NULL AND "longitud" IS NULL)
  OR
  ("latitud" IS NOT NULL AND "longitud" IS NOT NULL)
);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_detalle_no_entrega_no_vacio"
CHECK (
  "detalleNoEntrega" IS NULL
  OR LENGTH(TRIM("detalleNoEntrega")) > 0
);

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_observaciones_no_vacias"
CHECK (
  "observaciones" IS NULL
  OR LENGTH(TRIM("observaciones")) > 0
);


-- ============================================================================
-- CHECK CONSTRAINTS: ENTREGA DETALLE
-- ============================================================================

ALTER TABLE "EntregaDetalle"
ADD CONSTRAINT "EntregaDetalle_version_no_negativa"
CHECK ("version" >= 0);

ALTER TABLE "EntregaDetalle"
ADD CONSTRAINT "EntregaDetalle_cantidad_entregada_no_negativa"
CHECK ("cantidadEntregada" >= 0);

ALTER TABLE "EntregaDetalle"
ADD CONSTRAINT "EntregaDetalle_cantidad_rechazada_no_negativa"
CHECK ("cantidadRechazada" >= 0);

ALTER TABLE "EntregaDetalle"
ADD CONSTRAINT "EntregaDetalle_motivo_rechazo_no_vacio"
CHECK (
  "motivoRechazo" IS NULL
  OR LENGTH(TRIM("motivoRechazo")) > 0
);


-- ============================================================================
-- CHECK CONSTRAINTS: ENTREGA EVIDENCIA
-- ============================================================================

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_url_no_vacia"
CHECK (
  LENGTH(TRIM("url")) > 0
);

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_key_no_vacia"
CHECK (
  "key" IS NULL
  OR LENGTH(TRIM("key")) > 0
);

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_mime_type_no_vacio"
CHECK (
  "mimeType" IS NULL
  OR LENGTH(TRIM("mimeType")) > 0
);

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_size_no_negativo"
CHECK (
  "size" IS NULL
  OR "size" >= 0
);

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_descripcion_no_vacia"
CHECK (
  "descripcion" IS NULL
  OR LENGTH(TRIM("descripcion")) > 0
);

ALTER TABLE "EntregaEvidencia"
ADD CONSTRAINT "EntregaEvidencia_clave_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);


-- ============================================================================
-- CHECK CONSTRAINTS: ENTREGA EVENTO
-- ============================================================================

ALTER TABLE "EntregaEvento"
ADD CONSTRAINT "EntregaEvento_clave_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);

ALTER TABLE "EntregaEvento"
ADD CONSTRAINT "EntregaEvento_detalle_no_vacio"
CHECK (
  "detalle" IS NULL
  OR LENGTH(TRIM("detalle")) > 0
);

ALTER TABLE "EntregaEvento"
ADD CONSTRAINT "EntregaEvento_referencia_tipo_no_vacia"
CHECK (
  "referenciaTipo" IS NULL
  OR LENGTH(TRIM("referenciaTipo")) > 0
);

ALTER TABLE "EntregaEvento"
ADD CONSTRAINT "EntregaEvento_referencia_id_valida"
CHECK (
  "referenciaId" IS NULL
  OR "referenciaId" > 0
);