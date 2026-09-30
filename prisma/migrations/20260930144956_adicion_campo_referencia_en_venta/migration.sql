/*
  Warnings:

  - A unique constraint covering the columns `[referenciaPago]` on the table `Venta` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "referenciaPago" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Venta_referenciaPago_key" ON "Venta"("referenciaPago");
