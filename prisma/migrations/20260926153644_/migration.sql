/*
  Warnings:

  - A unique constraint covering the columns `[codigo]` on the table `Bodega` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TipoEventoBodega" AS ENUM ('CREADA', 'ACTUALIZADA', 'ACTIVADA', 'DESACTIVADA', 'RESPONSABLE_ASIGNADO', 'RESPONSABLE_REMOVIDO', 'ESTABLECIDA_PRINCIPAL');

-- DropIndex
DROP INDEX "Bodega_empresaId_activo_idx";

-- DropIndex
DROP INDEX "Bodega_empresaId_codigo_key";

-- AlterTable
ALTER TABLE "Bodega" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inactivadaEn" TIMESTAMP(3),
ADD COLUMN     "motivoInactivacion" TEXT,
ADD COLUMN     "responsableId" INTEGER,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "BodegaEvento" (
    "id" SERIAL NOT NULL,
    "bodegaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoBodega" NOT NULL,
    "detalle" TEXT,
    "metadata" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodegaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodegaEvento_bodegaId_creadoEn_idx" ON "BodegaEvento"("bodegaId", "creadoEn");

-- CreateIndex
CREATE INDEX "BodegaEvento_usuarioId_idx" ON "BodegaEvento"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_codigo_key" ON "Bodega"("codigo");

-- CreateIndex
CREATE INDEX "Bodega_activo_idx" ON "Bodega"("activo");

-- CreateIndex
CREATE INDEX "Bodega_esPrincipal_idx" ON "Bodega"("esPrincipal");

-- CreateIndex
CREATE INDEX "Bodega_responsableId_idx" ON "Bodega"("responsableId");

-- AddForeignKey
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodegaEvento" ADD CONSTRAINT "BodegaEvento_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodegaEvento" ADD CONSTRAINT "BodegaEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
