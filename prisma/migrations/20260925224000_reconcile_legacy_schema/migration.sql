-- Reconcile legacy schema changes that already existed in development
-- but were not represented in the Prisma migration history.
--
-- IMPORTANT:
-- - On databases that already contain these changes, mark this migration as
--   applied with prisma migrate resolve instead of executing it.
-- - On a fresh database, this migration brings the historical schema in sync
--   before the new operational/commercial refactor migration runs.

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'PAGADA', 'ATRASADA');

-- AlterTable
ALTER TABLE "Credito"
DROP COLUMN "testigos",
ADD COLUMN "fechaFin" TIMESTAMP(3),
ALTER COLUMN "montoTotal" DROP NOT NULL,
ALTER COLUMN "interes" DROP NOT NULL,
ALTER COLUMN "montoConInteres" DROP NOT NULL,
ALTER COLUMN "cuotaInicial" DROP NOT NULL,
ALTER COLUMN "dpi" DROP NOT NULL,
ALTER COLUMN "fechaContrato" DROP NOT NULL,
ALTER COLUMN "fechaInicio" DROP NOT NULL,
ALTER COLUMN "totalPagado" DROP NOT NULL,
ALTER COLUMN "numeroCuotas" DROP NOT NULL,
ALTER COLUMN "saldoPendiente" DROP NOT NULL,
ALTER COLUMN "diasEntrePagos" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CuotaCredito" (
    "id" SERIAL NOT NULL,
    "montoEsperado" DOUBLE PRECISION NOT NULL,
    "montoPagado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "comentario" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuotaCredito_pkey" PRIMARY KEY ("id")
);
