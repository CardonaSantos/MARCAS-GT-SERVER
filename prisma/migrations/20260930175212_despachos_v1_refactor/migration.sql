/*
  DESPACHOS V1 - SCHEMA REFINEMENT
  Base: e7f328c2d9713c0f0223d78031a7d3fed1688389

  Objetivos:
  - Mejorar trazabilidad de quién crea/prepara/despacha/cancela.
  - Añadir cantidadProgramada.
  - Añadir concurrencia optimista.
  - Preparar auditoría idempotente.
  - Añadir índices de operación/reportería.
  - No crear tablas nuevas.
*/


-- ============================================================================
-- ENUMS
-- ============================================================================

-- El estado PARCIAL era ambiguo; se deja explícito para el módulo.
ALTER TYPE "EstadoOrdenDespacho"
RENAME VALUE 'PARCIAL' TO 'PARCIALMENTE_DESPACHADA';

ALTER TYPE "TipoEventoOrdenDespacho"
ADD VALUE IF NOT EXISTS 'ACTUALIZADA';

ALTER TYPE "TipoEventoOrdenDespacho"
ADD VALUE IF NOT EXISTS 'PREPARACION_AJUSTADA';


-- ============================================================================
-- ORDEN DESPACHO
-- ============================================================================

ALTER TABLE "OrdenDespacho"
ADD COLUMN "creadoPorId" INTEGER,
ADD COLUMN "despachadoPorId" INTEGER,
ADD COLUMN "canceladoPorId" INTEGER,
ADD COLUMN "preparacionIniciadaEn" TIMESTAMP(3),
ADD COLUMN "canceladoEn" TIMESTAMP(3),
ADD COLUMN "motivoCancelacion" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;


-- Normalizar números vacíos históricos antes de aplicar constraints.
UPDATE "OrdenDespacho"
SET "numero" = NULL
WHERE "numero" IS NOT NULL
  AND LENGTH(TRIM("numero")) = 0;


-- Detener la migración con un mensaje claro si existen números duplicados.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrdenDespacho"
    WHERE "numero" IS NOT NULL
    GROUP BY "numero"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear OrdenDespacho_numero_key: existen números de despacho duplicados.';
  END IF;
END
$$;


CREATE UNIQUE INDEX "OrdenDespacho_numero_key"
ON "OrdenDespacho"("numero");


-- ============================================================================
-- ORDEN DESPACHO DETALLE
-- ============================================================================

ALTER TABLE "OrdenDespachoDetalle"
ADD COLUMN "cantidadProgramada" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "observaciones" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Compatibilidad con datos históricos:
-- si ya existían cantidades preparadas/despachadas, la cantidad programada
-- debe ser como mínimo la mayor de ellas.
UPDATE "OrdenDespachoDetalle"
SET "cantidadProgramada" = GREATEST(
  "cantidadProgramada",
  "cantidadPreparada",
  "cantidadDespachada"
);


-- ============================================================================
-- ORDEN DESPACHO EVENTO
-- ============================================================================

ALTER TABLE "OrdenDespachoEvento"
ADD COLUMN "referenciaTipo" TEXT,
ADD COLUMN "referenciaId" INTEGER,
ADD COLUMN "claveIdempotencia" TEXT,
ADD COLUMN "metadata" JSONB;


CREATE UNIQUE INDEX "OrdenDespachoEvento_claveIdempotencia_key"
ON "OrdenDespachoEvento"("claveIdempotencia");


-- ============================================================================
-- BACKFILL DE AUDITORÍA HISTÓRICA
-- ============================================================================

-- Creador: primer evento CREADA con usuario.
UPDATE "OrdenDespacho" od
SET "creadoPorId" = (
  SELECT e."usuarioId"
  FROM "OrdenDespachoEvento" e
  WHERE e."ordenDespachoId" = od."id"
    AND e."tipo" = 'CREADA'
    AND e."usuarioId" IS NOT NULL
  ORDER BY e."creadoEn" ASC, e."id" ASC
  LIMIT 1
)
WHERE od."creadoPorId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "OrdenDespachoEvento" e
    WHERE e."ordenDespachoId" = od."id"
      AND e."tipo" = 'CREADA'
      AND e."usuarioId" IS NOT NULL
  );


-- Momento real de inicio de preparación: primer evento PREPARACION_INICIADA.
UPDATE "OrdenDespacho" od
SET "preparacionIniciadaEn" = (
  SELECT e."creadoEn"
  FROM "OrdenDespachoEvento" e
  WHERE e."ordenDespachoId" = od."id"
    AND e."tipo" = 'PREPARACION_INICIADA'
  ORDER BY e."creadoEn" ASC, e."id" ASC
  LIMIT 1
)
WHERE od."preparacionIniciadaEn" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "OrdenDespachoEvento" e
    WHERE e."ordenDespachoId" = od."id"
      AND e."tipo" = 'PREPARACION_INICIADA'
  );


-- Responsable de salida: último evento DESPACHADA con usuario.
UPDATE "OrdenDespacho" od
SET "despachadoPorId" = (
  SELECT e."usuarioId"
  FROM "OrdenDespachoEvento" e
  WHERE e."ordenDespachoId" = od."id"
    AND e."tipo" = 'DESPACHADA'
    AND e."usuarioId" IS NOT NULL
  ORDER BY e."creadoEn" DESC, e."id" DESC
  LIMIT 1
)
WHERE od."despachadoPorId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "OrdenDespachoEvento" e
    WHERE e."ordenDespachoId" = od."id"
      AND e."tipo" = 'DESPACHADA'
      AND e."usuarioId" IS NOT NULL
  );


-- Cancelación: último evento CANCELADA.
UPDATE "OrdenDespacho" od
SET
  "canceladoPorId" = COALESCE(
    od."canceladoPorId",
    (
      SELECT e."usuarioId"
      FROM "OrdenDespachoEvento" e
      WHERE e."ordenDespachoId" = od."id"
        AND e."tipo" = 'CANCELADA'
        AND e."usuarioId" IS NOT NULL
      ORDER BY e."creadoEn" DESC, e."id" DESC
      LIMIT 1
    )
  ),
  "canceladoEn" = COALESCE(
    od."canceladoEn",
    (
      SELECT e."creadoEn"
      FROM "OrdenDespachoEvento" e
      WHERE e."ordenDespachoId" = od."id"
        AND e."tipo" = 'CANCELADA'
      ORDER BY e."creadoEn" DESC, e."id" DESC
      LIMIT 1
    )
  )
WHERE od."estado" = 'CANCELADA'
  AND EXISTS (
    SELECT 1
    FROM "OrdenDespachoEvento" e
    WHERE e."ordenDespachoId" = od."id"
      AND e."tipo" = 'CANCELADA'
  );


-- ============================================================================
-- FOREIGN KEYS DE AUDITORÍA
-- ============================================================================

ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_creadoPorId_fkey"
FOREIGN KEY ("creadoPorId")
REFERENCES "Usuario"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_despachadoPorId_fkey"
FOREIGN KEY ("despachadoPorId")
REFERENCES "Usuario"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_canceladoPorId_fkey"
FOREIGN KEY ("canceladoPorId")
REFERENCES "Usuario"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- ============================================================================
-- ÍNDICES - ORDEN DESPACHO
-- ============================================================================

CREATE INDEX "OrdenDespacho_estado_creadoEn_idx"
ON "OrdenDespacho"("estado", "creadoEn");

CREATE INDEX "OrdenDespacho_estado_programadoEn_idx"
ON "OrdenDespacho"("estado", "programadoEn");

CREATE INDEX "OrdenDespacho_creadoPorId_creadoEn_idx"
ON "OrdenDespacho"("creadoPorId", "creadoEn");

CREATE INDEX "OrdenDespacho_preparadoPorId_preparadoEn_idx"
ON "OrdenDespacho"("preparadoPorId", "preparadoEn");

CREATE INDEX "OrdenDespacho_despachadoPorId_despachadoEn_idx"
ON "OrdenDespacho"("despachadoPorId", "despachadoEn");

CREATE INDEX "OrdenDespacho_canceladoPorId_canceladoEn_idx"
ON "OrdenDespacho"("canceladoPorId", "canceladoEn");


-- ============================================================================
-- ÍNDICES - DETALLE
-- ============================================================================

CREATE INDEX "OrdenDespachoDetalle_pedidoDetalleId_idx"
ON "OrdenDespachoDetalle"("pedidoDetalleId");

CREATE INDEX "OrdenDespachoDetalle_productoId_idx"
ON "OrdenDespachoDetalle"("productoId");


-- ============================================================================
-- ÍNDICES - EVENTOS
-- ============================================================================

CREATE INDEX "OrdenDespachoEvento_tipo_creadoEn_idx"
ON "OrdenDespachoEvento"("tipo", "creadoEn");

CREATE INDEX "OrdenDespachoEvento_usuarioId_creadoEn_idx"
ON "OrdenDespachoEvento"("usuarioId", "creadoEn");

CREATE INDEX "OrdenDespachoEvento_referenciaTipo_referenciaId_idx"
ON "OrdenDespachoEvento"("referenciaTipo", "referenciaId");


-- ============================================================================
-- CHECK CONSTRAINTS - ORDEN DESPACHO
-- ============================================================================

ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_version_no_negativa"
CHECK (
  "version" >= 0
);


ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_numero_no_vacio"
CHECK (
  "numero" IS NULL
  OR LENGTH(TRIM("numero")) > 0
);


ALTER TABLE "OrdenDespacho"
ADD CONSTRAINT "OrdenDespacho_motivo_cancelacion_valido"
CHECK (
  "motivoCancelacion" IS NULL
  OR LENGTH(TRIM("motivoCancelacion")) >= 3
);


-- ============================================================================
-- CHECK CONSTRAINTS - DETALLE
-- ============================================================================

ALTER TABLE "OrdenDespachoDetalle"
ADD CONSTRAINT "OrdenDespachoDetalle_cantidades_no_negativas"
CHECK (
  "cantidadProgramada" >= 0
  AND "cantidadPreparada" >= 0
  AND "cantidadDespachada" >= 0
);


ALTER TABLE "OrdenDespachoDetalle"
ADD CONSTRAINT "OrdenDespachoDetalle_flujo_cantidades_valido"
CHECK (
  "cantidadDespachada" <= "cantidadPreparada"
  AND "cantidadPreparada" <= "cantidadProgramada"
);


ALTER TABLE "OrdenDespachoDetalle"
ADD CONSTRAINT "OrdenDespachoDetalle_version_no_negativa"
CHECK (
  "version" >= 0
);


-- ============================================================================
-- CHECK CONSTRAINTS - EVENTO
-- ============================================================================

ALTER TABLE "OrdenDespachoEvento"
ADD CONSTRAINT "OrdenDespachoEvento_referencia_consistente"
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


ALTER TABLE "OrdenDespachoEvento"
ADD CONSTRAINT "OrdenDespachoEvento_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);


-- ============================================================================
-- NOTAS
-- ============================================================================
--
-- No se crean FKs hacia MovimientoInventario o ReservaInventario.
-- La integración entre módulos será por puertos + referencia lógica.
--
-- Para nuevas órdenes, el dominio de Despachos deberá exigir:
-- cantidadProgramada > 0.
-- El CHECK de BD permite 0 únicamente para compatibilidad histórica.
--
-- Los índices existentes:
--   OrdenDespacho_pedidoId_estado_idx
--   OrdenDespacho_bodegaId_estado_idx
--   OrdenDespachoEvento_ordenDespachoId_creadoEn_idx
-- se conservan.
-- ============================================================================
