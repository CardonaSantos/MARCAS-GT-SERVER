-- Credit payment plan V1.
-- Additive migration only: no legacy tables or existing columns are removed/rewritten.

CREATE TYPE "EstadoPlanPagoCredito" AS ENUM ('BORRADOR', 'ACTIVO', 'CANCELADO');
CREATE TYPE "FrecuenciaPlanPagoCredito" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL', 'PERSONALIZADA');
CREATE TYPE "TipoEventoPlanPagoCredito" AS ENUM ('CREADO', 'ACTUALIZADO', 'ACTIVADO', 'CANCELADO', 'OBSERVACION');

CREATE TABLE "CreditoPlanPago" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "creditoId" INTEGER NOT NULL,
    "estado" "EstadoPlanPagoCredito" NOT NULL DEFAULT 'BORRADOR',
    "frecuencia" "FrecuenciaPlanPagoCredito" NOT NULL,
    "montoProgramado" DECIMAL(12,2) NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "primeraFechaVencimiento" TIMESTAMP(3) NOT NULL,
    "creadoPorId" INTEGER,
    "activadoPorId" INTEGER,
    "canceladoPorId" INTEGER,
    "activadoEn" TIMESTAMP(3),
    "canceladoEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "claveIdempotenciaCreacion" TEXT,
    "claveIdempotenciaActivacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditoPlanPago_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditoPlanPago_numeroCuotas_check" CHECK ("numeroCuotas" > 0),
    CONSTRAINT "CreditoPlanPago_montoProgramado_check" CHECK ("montoProgramado" > 0)
);

CREATE TABLE "CreditoCuota" (
    "id" SERIAL NOT NULL,
    "planPagoId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "montoProgramado" DECIMAL(12,2) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "cuentaPorCobrarId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditoCuota_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditoCuota_numero_check" CHECK ("numero" > 0),
    CONSTRAINT "CreditoCuota_montoProgramado_check" CHECK ("montoProgramado" > 0)
);

CREATE TABLE "CreditoPlanPagoEvento" (
    "id" SERIAL NOT NULL,
    "planPagoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoPlanPagoCredito" NOT NULL,
    "estado" "EstadoPlanPagoCredito" NOT NULL,
    "detalle" TEXT,
    "metadata" JSONB,
    "claveIdempotencia" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditoPlanPagoEvento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditoPlanPago_creditoId_key"
ON "CreditoPlanPago"("creditoId");

CREATE UNIQUE INDEX "CreditoPlanPago_claveIdempotenciaCreacion_key"
ON "CreditoPlanPago"("claveIdempotenciaCreacion");

CREATE UNIQUE INDEX "CreditoPlanPago_claveIdempotenciaActivacion_key"
ON "CreditoPlanPago"("claveIdempotenciaActivacion");

CREATE INDEX "CreditoPlanPago_empresaId_estado_creadoEn_idx"
ON "CreditoPlanPago"("empresaId", "estado", "creadoEn");

CREATE INDEX "CreditoPlanPago_creadoPorId_idx"
ON "CreditoPlanPago"("creadoPorId");

CREATE INDEX "CreditoPlanPago_activadoPorId_idx"
ON "CreditoPlanPago"("activadoPorId");

CREATE INDEX "CreditoPlanPago_canceladoPorId_idx"
ON "CreditoPlanPago"("canceladoPorId");

CREATE UNIQUE INDEX "CreditoCuota_cuentaPorCobrarId_key"
ON "CreditoCuota"("cuentaPorCobrarId");

CREATE UNIQUE INDEX "CreditoCuota_planPagoId_numero_key"
ON "CreditoCuota"("planPagoId", "numero");

CREATE INDEX "CreditoCuota_planPagoId_fechaVencimiento_idx"
ON "CreditoCuota"("planPagoId", "fechaVencimiento");

CREATE UNIQUE INDEX "CreditoPlanPagoEvento_claveIdempotencia_key"
ON "CreditoPlanPagoEvento"("claveIdempotencia");

CREATE INDEX "CreditoPlanPagoEvento_planPagoId_creadoEn_idx"
ON "CreditoPlanPagoEvento"("planPagoId", "creadoEn");

CREATE INDEX "CreditoPlanPagoEvento_tipo_creadoEn_idx"
ON "CreditoPlanPagoEvento"("tipo", "creadoEn");

CREATE INDEX "CreditoPlanPagoEvento_usuarioId_creadoEn_idx"
ON "CreditoPlanPagoEvento"("usuarioId", "creadoEn");

ALTER TABLE "CreditoPlanPago"
ADD CONSTRAINT "CreditoPlanPago_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPago"
ADD CONSTRAINT "CreditoPlanPago_creditoId_fkey"
FOREIGN KEY ("creditoId") REFERENCES "Credito"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPago"
ADD CONSTRAINT "CreditoPlanPago_creadoPorId_fkey"
FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPago"
ADD CONSTRAINT "CreditoPlanPago_activadoPorId_fkey"
FOREIGN KEY ("activadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPago"
ADD CONSTRAINT "CreditoPlanPago_canceladoPorId_fkey"
FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditoCuota"
ADD CONSTRAINT "CreditoCuota_planPagoId_fkey"
FOREIGN KEY ("planPagoId") REFERENCES "CreditoPlanPago"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditoCuota"
ADD CONSTRAINT "CreditoCuota_cuentaPorCobrarId_fkey"
FOREIGN KEY ("cuentaPorCobrarId") REFERENCES "CuentaPorCobrar"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPagoEvento"
ADD CONSTRAINT "CreditoPlanPagoEvento_planPagoId_fkey"
FOREIGN KEY ("planPagoId") REFERENCES "CreditoPlanPago"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditoPlanPagoEvento"
ADD CONSTRAINT "CreditoPlanPagoEvento_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
