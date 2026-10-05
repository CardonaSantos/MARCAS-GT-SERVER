-- ============================================================================
-- TRACKING / JORNADA V1 - HARDENING
-- ============================================================================
--
-- Objetivos:
--
-- 1. Convertir Asistencia en la jornada diaria oficial.
-- 2. Reconciliar asistencias legacy duplicadas por usuario/día.
-- 3. Garantizar una sola sesión ACTIVA por usuario.
-- 4. Añadir idempotencia a las ubicaciones históricas.
-- 5. Mejorar índices para jornada, tracking y expiración.
-- 6. Añadir restricciones de integridad para tracking GPS.
--
-- ============================================================================


-- ============================================================================
-- 1. NORMALIZAR FECHA DE ASISTENCIA AL DÍA LABORAL DE GUATEMALA
-- ============================================================================
--
-- Prisma almacena DateTime como TIMESTAMP.
-- Los instantes actuales se manejan como UTC por convención.
--
-- "fecha" deja de representar un instante arbitrario y pasa a representar
-- exclusivamente el día lógico de la jornada:
--
--   2026-10-05 00:00:00
--
-- La hora real de entrada permanece en "entrada".
-- ============================================================================

UPDATE "Asistencia"
SET "fecha" = date_trunc(
  'day',
  ("entrada" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guatemala'
);


-- ============================================================================
-- 2. CONSOLIDAR ASISTENCIAS LEGACY DUPLICADAS
-- ============================================================================
--
-- Regla nueva:
--
--   1 Usuario + 1 Día = 1 Asistencia/Jornada
--
-- Si existen varios registros legacy del mismo usuario y día:
--
-- - conservamos el registro con menor id;
-- - entrada = primera entrada registrada;
-- - si alguna asistencia está abierta, la jornada queda abierta;
-- - si todas están cerradas, salida = última salida registrada;
-- - creadoEn = fecha de creación histórica más antigua.
-- ============================================================================

WITH jornadas_duplicadas AS (
  SELECT
    "usuarioId",
    "fecha",
    MIN("id") AS "keeperId",
    MIN("entrada") AS "entrada",
    CASE
      WHEN BOOL_OR("salida" IS NULL) THEN NULL
      ELSE MAX("salida")
    END AS "salida",
    MIN("creadoEn") AS "creadoEn"
  FROM "Asistencia"
  GROUP BY
    "usuarioId",
    "fecha"
  HAVING COUNT(*) > 1
)
UPDATE "Asistencia" AS a
SET
  "entrada" = j."entrada",
  "salida" = j."salida",
  "creadoEn" = j."creadoEn"
FROM jornadas_duplicadas AS j
WHERE a."id" = j."keeperId";


-- ============================================================================
-- 3. REASIGNAR SESIONES TRACKING DE ASISTENCIAS DUPLICADAS
-- ============================================================================
--
-- Antes de eliminar registros duplicados, cualquier SesionTrackingUsuario
-- relacionada debe apuntar a la jornada conservada.
-- ============================================================================

WITH duplicados AS (
  SELECT
    a."id" AS "duplicateId",
    agrupadas."keeperId"
  FROM "Asistencia" AS a
  INNER JOIN (
    SELECT
      "usuarioId",
      "fecha",
      MIN("id") AS "keeperId"
    FROM "Asistencia"
    GROUP BY
      "usuarioId",
      "fecha"
    HAVING COUNT(*) > 1
  ) AS agrupadas
    ON agrupadas."usuarioId" = a."usuarioId"
   AND agrupadas."fecha" = a."fecha"
  WHERE a."id" <> agrupadas."keeperId"
)
UPDATE "SesionTrackingUsuario" AS s
SET "asistenciaId" = d."keeperId"
FROM duplicados AS d
WHERE s."asistenciaId" = d."duplicateId";


-- ============================================================================
-- 4. ELIMINAR ASISTENCIAS DUPLICADAS YA CONSOLIDADAS
-- ============================================================================

WITH duplicados AS (
  SELECT
    a."id" AS "duplicateId"
  FROM "Asistencia" AS a
  INNER JOIN (
    SELECT
      "usuarioId",
      "fecha",
      MIN("id") AS "keeperId"
    FROM "Asistencia"
    GROUP BY
      "usuarioId",
      "fecha"
    HAVING COUNT(*) > 1
  ) AS agrupadas
    ON agrupadas."usuarioId" = a."usuarioId"
   AND agrupadas."fecha" = a."fecha"
  WHERE a."id" <> agrupadas."keeperId"
)
DELETE FROM "Asistencia" AS a
USING duplicados AS d
WHERE a."id" = d."duplicateId";


-- ============================================================================
-- 5. PREFLIGHT - ASISTENCIA
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Asistencia"
    GROUP BY "usuarioId", "fecha"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'La reconciliación de Asistencia dejó jornadas duplicadas.';
  END IF;
END
$$;


-- ============================================================================
-- 6. PREFLIGHT - SESIONES ACTIVAS
-- ============================================================================
--
-- Aquí NO elegimos automáticamente qué sesión conservar.
--
-- Dos sesiones ACTIVA para el mismo usuario representan una inconsistencia
-- que debe revisarse explícitamente.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SesionTrackingUsuario"
    WHERE "estado" = 'ACTIVA'
    GROUP BY "usuarioId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear el índice de sesión activa: existen usuarios con más de una sesión ACTIVA.';
  END IF;
END
$$;


-- ============================================================================
-- 7. REEMPLAZAR ÍNDICES ANTIGUOS DE TRACKING
-- ============================================================================

DROP INDEX "SesionTrackingUsuario_asistenciaId_idx";

DROP INDEX "SesionTrackingUsuario_ultimoHeartbeatEn_idx";


-- ============================================================================
-- 8. ASISTENCIA - AUDITORÍA DE ACTUALIZACIÓN
-- ============================================================================

ALTER TABLE "Asistencia"
ADD COLUMN "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- ============================================================================
-- 9. UBICACION HISTORIAL - IDEMPOTENCIA
-- ============================================================================
--
-- Los puntos legacy no poseían clave de idempotencia.
--
-- Se genera una clave determinística:
--
--   legacy-location:<id>
--
-- Los nuevos puntos deberán recibir una clave generada por el cliente.
-- ============================================================================

ALTER TABLE "UbicacionUsuarioHistorial"
ADD COLUMN "claveIdempotencia" TEXT;

UPDATE "UbicacionUsuarioHistorial"
SET "claveIdempotencia" = 'legacy-location:' || "id"::text
WHERE "claveIdempotencia" IS NULL;

ALTER TABLE "UbicacionUsuarioHistorial"
ALTER COLUMN "claveIdempotencia" SET NOT NULL;


-- ============================================================================
-- 10. ÍNDICES - ASISTENCIA
-- ============================================================================

CREATE INDEX "Asistencia_fecha_idx"
ON "Asistencia"("fecha");

CREATE UNIQUE INDEX "Asistencia_usuarioId_fecha_key"
ON "Asistencia"("usuarioId", "fecha");


-- ============================================================================
-- 11. ÍNDICES - SESIONES TRACKING
-- ============================================================================

CREATE INDEX "SesionTrackingUsuario_usuarioId_iniciadaEn_idx"
ON "SesionTrackingUsuario"("usuarioId", "iniciadaEn");

CREATE INDEX "SesionTrackingUsuario_asistenciaId_iniciadaEn_idx"
ON "SesionTrackingUsuario"("asistenciaId", "iniciadaEn");

CREATE INDEX "SesionTrackingUsuario_estado_ultimoHeartbeatEn_idx"
ON "SesionTrackingUsuario"("estado", "ultimoHeartbeatEn");


-- ============================================================================
-- 12. SOLO UNA SESIÓN ACTIVA POR USUARIO
-- ============================================================================
--
-- Prisma no expresa índices UNIQUE parciales.
--
-- Esta restricción complementará el control SERIALIZABLE del repositorio.
-- ============================================================================

CREATE UNIQUE INDEX "SesionTrackingUsuario_usuario_activa_key"
ON "SesionTrackingUsuario"("usuarioId")
WHERE "estado" = 'ACTIVA';


-- ============================================================================
-- 13. ÍNDICES - UBICACIÓN HISTÓRICA
-- ============================================================================

CREATE UNIQUE INDEX "UbicacionUsuarioHistorial_claveIdempotencia_key"
ON "UbicacionUsuarioHistorial"("claveIdempotencia");


-- ============================================================================
-- 14. CHECKS - ASISTENCIA
-- ============================================================================

ALTER TABLE "Asistencia"

ADD CONSTRAINT "Asistencia_fecha_normalizada_check"
CHECK (
  "fecha" = date_trunc('day', "fecha")
) NOT VALID,

ADD CONSTRAINT "Asistencia_salida_check"
CHECK (
  "salida" IS NULL
  OR "salida" >= "entrada"
) NOT VALID;


-- ============================================================================
-- 15. CHECKS - SESIÓN TRACKING
-- ============================================================================

ALTER TABLE "SesionTrackingUsuario"

ADD CONSTRAINT "SesionTrackingUsuario_heartbeat_check"
CHECK (
  "ultimoHeartbeatEn" >= "iniciadaEn"
) NOT VALID,

ADD CONSTRAINT "SesionTrackingUsuario_finalizacion_check"
CHECK (
  (
    "estado" = 'ACTIVA'
    AND "finalizadaEn" IS NULL
  )
  OR
  (
    "estado" IN ('FINALIZADA', 'EXPIRADA')
    AND "finalizadaEn" IS NOT NULL
  )
) NOT VALID;


-- ============================================================================
-- 16. CHECKS - UBICACIÓN HISTÓRICA
-- ============================================================================

ALTER TABLE "UbicacionUsuarioHistorial"

ADD CONSTRAINT "UbicacionUsuarioHistorial_latitud_check"
CHECK (
  "latitud" BETWEEN -90 AND 90
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioHistorial_longitud_check"
CHECK (
  "longitud" BETWEEN -180 AND 180
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioHistorial_precision_check"
CHECK (
  "precisionM" IS NULL
  OR "precisionM" >= 0
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioHistorial_velocidad_check"
CHECK (
  "velocidadMps" IS NULL
  OR "velocidadMps" >= 0
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioHistorial_bateria_check"
CHECK (
  "bateriaPct" IS NULL
  OR "bateriaPct" BETWEEN 0 AND 100
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioHistorial_idempotencia_check"
CHECK (
  length(trim("claveIdempotencia")) > 0
) NOT VALID;


-- ============================================================================
-- 17. CHECKS - UBICACIÓN ACTUAL
-- ============================================================================

ALTER TABLE "UbicacionUsuarioActual"

ADD CONSTRAINT "UbicacionUsuarioActual_latitud_check"
CHECK (
  "latitud" BETWEEN -90 AND 90
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioActual_longitud_check"
CHECK (
  "longitud" BETWEEN -180 AND 180
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioActual_precision_check"
CHECK (
  "precisionM" IS NULL
  OR "precisionM" >= 0
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioActual_velocidad_check"
CHECK (
  "velocidadMps" IS NULL
  OR "velocidadMps" >= 0
) NOT VALID,

ADD CONSTRAINT "UbicacionUsuarioActual_bateria_check"
CHECK (
  "bateriaPct" IS NULL
  OR "bateriaPct" BETWEEN 0 AND 100
) NOT VALID;