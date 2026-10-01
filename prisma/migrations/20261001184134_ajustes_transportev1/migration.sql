-- ============================================================================
-- TRANSPORTE V1
-- Migración Prisma corregida con backfills + constraints de integridad.
--
-- IMPORTANTE:
-- - Sustituye COMPLETO el contenido del migration.sql generado por Prisma.
-- - Esta migración NO debe haberse aplicado todavía.
-- - Está diseñada para conservar registros históricos sin inventar relaciones
--   ambiguas.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE "EstadoConductor" AS ENUM (
  'DISPONIBLE',
  'ASIGNADO',
  'EN_RUTA',
  'INACTIVO'
);

CREATE TYPE "EstadoParadaEnvio" AS ENUM (
  'PENDIENTE',
  'EN_RUTA',
  'ATENDIDA',
  'INCIDENCIA',
  'CANCELADA'
);

CREATE TYPE "TipoEventoEnvio" AS ENUM (
  'CREADO',
  'ACTUALIZADO',
  'CARGA_AJUSTADA',
  'ASIGNADO',
  'CARGA_CONFIRMADA',
  'ENTREGADO_TRANSPORTISTA',
  'RUTA_INICIADA',
  'PARADA_ATENDIDA',
  'INCIDENCIA_REPORTADA',
  'INCIDENCIA_RESUELTA',
  'ENTREGA_PARCIAL',
  'COMPLETADO',
  'CANCELADO',
  'OBSERVACION'
);

CREATE TYPE "SeveridadIncidenciaEnvio" AS ENUM (
  'BAJA',
  'MEDIA',
  'ALTA',
  'CRITICA'
);

CREATE TYPE "EstadoIncidenciaEnvio" AS ENUM (
  'ABIERTA',
  'EN_ATENCION',
  'RESUELTA'
);

CREATE TYPE "TipoIncidenciaEnvio" AS ENUM (
  'AVERIA',
  'ACCIDENTE',
  'TRAFICO',
  'BLOQUEO_RUTA',
  'SEGURIDAD',
  'DOCUMENTACION',
  'CLIENTE_NO_DISPONIBLE',
  'DIRECCION_INCORRECTA',
  'MERCADERIA',
  'OTRO'
);

ALTER TYPE "EstadoEnvio" ADD VALUE 'CARGADO';

-- ============================================================================
-- CONDUCTOR
-- ============================================================================

DROP INDEX "Conductor_empresaId_activo_idx";

ALTER TABLE "Conductor"
  ADD COLUMN "estado" "EstadoConductor" NOT NULL DEFAULT 'DISPONIBLE',
  ADD COLUMN "inactivadaEn" TIMESTAMP(3),
  ADD COLUMN "motivoInactivacion" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Los conductores históricos desactivados no deben quedar DISPONIBLES.
UPDATE "Conductor"
SET "estado" = 'INACTIVO'
WHERE "activo" = FALSE;

-- ============================================================================
-- ENTREGA
-- ============================================================================

ALTER TABLE "Entrega"
  ADD COLUMN "envioDespachoId" INTEGER;

-- ============================================================================
-- ENVIO
-- ============================================================================
-- numero se agrega nullable primero para poder migrar tablas con datos.

ALTER TABLE "Envio"
  ADD COLUMN "asignadoEn" TIMESTAMP(3),
  ADD COLUMN "asignadoPorId" INTEGER,
  ADD COLUMN "bodegaId" INTEGER,
  ADD COLUMN "canceladoEn" TIMESTAMP(3),
  ADD COLUMN "canceladoPorId" INTEGER,
  ADD COLUMN "cargaConfirmadaEn" TIMESTAMP(3),
  ADD COLUMN "cargaConfirmadaPorId" INTEGER,
  ADD COLUMN "completadoPorId" INTEGER,
  ADD COLUMN "creadoPorId" INTEGER,
  ADD COLUMN "entregaEstimadaEn" TIMESTAMP(3),
  ADD COLUMN "iniciadoPorId" INTEGER,
  ADD COLUMN "modalidad" "TipoTransportista" NOT NULL DEFAULT 'INTERNO',
  ADD COLUMN "motivoCancelacion" TEXT,
  ADD COLUMN "numero" TEXT,
  ADD COLUMN "salidaProgramadaEn" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Número humano para Envios históricos.
UPDATE "Envio"
SET "numero" = 'ENV-' || LPAD("id"::TEXT, 6, '0')
WHERE "numero" IS NULL;

ALTER TABLE "Envio"
  ALTER COLUMN "numero" SET NOT NULL;

-- Si ya existía transportista, preservamos su modalidad histórica.
UPDATE "Envio" e
SET "modalidad" = t."tipo"
FROM "Transportista" t
WHERE e."transportistaId" = t."id";

-- Inferimos bodega únicamente cuando todos los despachos asociados al envío
-- pertenecen a una sola bodega. Si existe ambigüedad, queda NULL.
UPDATE "Envio" e
SET "bodegaId" = src."bodegaId"
FROM (
  SELECT
    ed."envioId",
    MIN(od."bodegaId") AS "bodegaId"
  FROM "EnvioDespacho" ed
  INNER JOIN "OrdenDespacho" od
    ON od."id" = ed."ordenDespachoId"
  GROUP BY ed."envioId"
  HAVING COUNT(DISTINCT od."bodegaId") = 1
) src
WHERE e."id" = src."envioId"
  AND e."bodegaId" IS NULL;

-- ============================================================================
-- ENVIO DESPACHO / PARADA
-- ============================================================================
-- Las columnas requeridas se agregan temporalmente nullable, se rellenan y
-- después se convierten a NOT NULL.

ALTER TABLE "EnvioDespacho"
  ADD COLUMN "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "clienteId" INTEGER,
  ADD COLUMN "destinatario" TEXT,
  ADD COLUMN "direccionDestino" TEXT,
  ADD COLUMN "estado" "EstadoParadaEnvio" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "latitudDestino" DECIMAL(10,7),
  ADD COLUMN "longitudDestino" DECIMAL(10,7),
  ADD COLUMN "secuencia" INTEGER,
  ADD COLUMN "telefonoDestino" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Snapshot histórico de cliente/destino a partir del Pedido del despacho.
UPDATE "EnvioDespacho" ed
SET
  "clienteId" = p."clienteId",
  "destinatario" = TRIM(
    CONCAT(c."nombre", ' ', COALESCE(c."apellido", ''))
  ),
  "telefonoDestino" = c."telefono",
  "direccionDestino" = c."direccion"
FROM "OrdenDespacho" od
INNER JOIN "Pedido" p
  ON p."id" = od."pedidoId"
INNER JOIN "Cliente" c
  ON c."id" = p."clienteId"
WHERE od."id" = ed."ordenDespachoId";

-- Snapshot de coordenadas cuando el cliente tiene ubicación registrada.
UPDATE "EnvioDespacho" ed
SET
  "latitudDestino" = uc."latitud",
  "longitudDestino" = uc."longitud"
FROM "UbicacionCliente" uc
WHERE uc."clienteId" = ed."clienteId";

-- Secuencia determinista para paradas históricas.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "envioId"
      ORDER BY "id"
    ) AS seq
  FROM "EnvioDespacho"
)
UPDATE "EnvioDespacho" ed
SET "secuencia" = ranked.seq
FROM ranked
WHERE ranked."id" = ed."id";

-- A partir de aquí los campos exigidos por el nuevo schema quedan NOT NULL.
ALTER TABLE "EnvioDespacho"
  ALTER COLUMN "clienteId" SET NOT NULL,
  ALTER COLUMN "destinatario" SET NOT NULL,
  ALTER COLUMN "direccionDestino" SET NOT NULL,
  ALTER COLUMN "secuencia" SET NOT NULL;

-- El default temporal solo se necesitó para registros históricos.
ALTER TABLE "EnvioDespacho"
  ALTER COLUMN "actualizadoEn" DROP DEFAULT;

-- ============================================================================
-- ENVIO EVENTO
-- ============================================================================
-- tipo se agrega nullable, se deriva del estado histórico y luego se hace
-- obligatorio. Así evitamos marcar todo artificialmente como ACTUALIZADO.

ALTER TABLE "EnvioEvento"
  ADD COLUMN "claveIdempotencia" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "tipo" "TipoEventoEnvio";

UPDATE "EnvioEvento"
SET "tipo" = CASE "estado"
  WHEN 'PROGRAMADO' THEN 'CREADO'::"TipoEventoEnvio"
  WHEN 'ASIGNADO' THEN 'ASIGNADO'::"TipoEventoEnvio"
  WHEN 'EN_RUTA' THEN 'RUTA_INICIADA'::"TipoEventoEnvio"
  WHEN 'ENTREGADO_PARCIAL' THEN 'ENTREGA_PARCIAL'::"TipoEventoEnvio"
  WHEN 'COMPLETADO' THEN 'COMPLETADO'::"TipoEventoEnvio"
  WHEN 'INCIDENCIA' THEN 'INCIDENCIA_REPORTADA'::"TipoEventoEnvio"
  WHEN 'CANCELADO' THEN 'CANCELADO'::"TipoEventoEnvio"
  ELSE 'ACTUALIZADO'::"TipoEventoEnvio"
END
WHERE "tipo" IS NULL;

ALTER TABLE "EnvioEvento"
  ALTER COLUMN "tipo" SET NOT NULL;

-- ============================================================================
-- TRANSPORTISTA
-- ============================================================================

ALTER TABLE "Transportista"
  ADD COLUMN "codigo" TEXT,
  ADD COLUMN "inactivadaEn" TIMESTAMP(3),
  ADD COLUMN "motivoInactivacion" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- VEHICULO
-- ============================================================================

ALTER TABLE "Vehiculo"
  ADD COLUMN "inactivadaEn" TIMESTAMP(3),
  ADD COLUMN "motivoInactivacion" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- ENVIO CARGA DETALLE
-- ============================================================================

CREATE TABLE "EnvioCargaDetalle" (
  "id" SERIAL NOT NULL,
  "envioDespachoId" INTEGER NOT NULL,
  "ordenDespachoDetalleId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadPlanificada" INTEGER NOT NULL,
  "cantidadCargada" INTEGER NOT NULL DEFAULT 0,
  "observaciones" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnvioCargaDetalle_pkey" PRIMARY KEY ("id")
);

-- Backfill conservador:
-- Solo inferimos carga cuando el OrdenDespacho aparece en UN único viaje.
-- Si el mismo despacho fue asociado históricamente a varios viajes, no es
-- posible conocer cuánto llevó cada uno y no inventamos esa distribución.
WITH despacho_no_ambiguo AS (
  SELECT
    "ordenDespachoId",
    MIN("id") AS "envioDespachoId"
  FROM "EnvioDespacho"
  GROUP BY "ordenDespachoId"
  HAVING COUNT(*) = 1
)
INSERT INTO "EnvioCargaDetalle" (
  "envioDespachoId",
  "ordenDespachoDetalleId",
  "productoId",
  "cantidadPlanificada",
  "cantidadCargada",
  "actualizadoEn"
)
SELECT
  dna."envioDespachoId",
  odd."id",
  odd."productoId",
  odd."cantidadDespachada",
  odd."cantidadDespachada",
  CURRENT_TIMESTAMP
FROM despacho_no_ambiguo dna
INNER JOIN "OrdenDespachoDetalle" odd
  ON odd."ordenDespachoId" = dna."ordenDespachoId"
WHERE odd."cantidadDespachada" > 0;

-- ============================================================================
-- ENVIO INCIDENCIA
-- ============================================================================

CREATE TABLE "EnvioIncidencia" (
  "id" SERIAL NOT NULL,
  "envioId" INTEGER NOT NULL,
  "tipo" "TipoIncidenciaEnvio" NOT NULL,
  "severidad" "SeveridadIncidenciaEnvio" NOT NULL DEFAULT 'MEDIA',
  "estado" "EstadoIncidenciaEnvio" NOT NULL DEFAULT 'ABIERTA',
  "descripcion" TEXT NOT NULL,
  "reportadaPorId" INTEGER,
  "reportadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitud" DECIMAL(10,7),
  "longitud" DECIMAL(10,7),
  "resueltaPorId" INTEGER,
  "resueltaEn" TIMESTAMP(3),
  "resolucion" TEXT,
  "claveIdempotencia" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnvioIncidencia_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- BACKFILL ENTREGA -> ENVIO DESPACHO
-- ============================================================================
-- Solo vinculamos automáticamente cuando existe UNA única parada para ese
-- despacho. Si hubo varios viajes, se deja NULL para no inventar el origen.

UPDATE "Entrega" e
SET "envioDespachoId" = src."envioDespachoId"
FROM (
  SELECT
    ed."ordenDespachoId",
    MIN(ed."id") AS "envioDespachoId"
  FROM "EnvioDespacho" ed
  GROUP BY ed."ordenDespachoId"
  HAVING COUNT(*) = 1
) src
WHERE src."ordenDespachoId" = e."ordenDespachoId"
  AND e."envioDespachoId" IS NULL;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX "EnvioCargaDetalle_ordenDespachoDetalleId_idx"
  ON "EnvioCargaDetalle"("ordenDespachoDetalleId");

CREATE INDEX "EnvioCargaDetalle_productoId_idx"
  ON "EnvioCargaDetalle"("productoId");

CREATE UNIQUE INDEX "EnvioCargaDetalle_envioDespachoId_ordenDespachoDetalleId_key"
  ON "EnvioCargaDetalle"("envioDespachoId", "ordenDespachoDetalleId");

CREATE UNIQUE INDEX "EnvioIncidencia_claveIdempotencia_key"
  ON "EnvioIncidencia"("claveIdempotencia");

CREATE INDEX "EnvioIncidencia_envioId_estado_reportadaEn_idx"
  ON "EnvioIncidencia"("envioId", "estado", "reportadaEn");

CREATE INDEX "EnvioIncidencia_tipo_severidad_reportadaEn_idx"
  ON "EnvioIncidencia"("tipo", "severidad", "reportadaEn");

CREATE INDEX "Conductor_empresaId_estado_activo_idx"
  ON "Conductor"("empresaId", "estado", "activo");

CREATE INDEX "Conductor_transportistaId_estado_activo_idx"
  ON "Conductor"("transportistaId", "estado", "activo");

CREATE UNIQUE INDEX "Entrega_envioDespachoId_key"
  ON "Entrega"("envioDespachoId");

CREATE INDEX "Entrega_envioDespachoId_estado_idx"
  ON "Entrega"("envioDespachoId", "estado");

CREATE UNIQUE INDEX "Envio_numero_key"
  ON "Envio"("numero");

CREATE INDEX "Envio_bodegaId_estado_creadoEn_idx"
  ON "Envio"("bodegaId", "estado", "creadoEn");

CREATE INDEX "Envio_transportistaId_estado_creadoEn_idx"
  ON "Envio"("transportistaId", "estado", "creadoEn");

CREATE INDEX "Envio_vehiculoId_estado_idx"
  ON "Envio"("vehiculoId", "estado");

CREATE INDEX "Envio_conductorId_estado_idx"
  ON "Envio"("conductorId", "estado");

CREATE INDEX "Envio_responsableId_estado_idx"
  ON "Envio"("responsableId", "estado");

CREATE INDEX "Envio_salidaProgramadaEn_estado_idx"
  ON "Envio"("salidaProgramadaEn", "estado");

CREATE INDEX "EnvioDespacho_clienteId_estado_idx"
  ON "EnvioDespacho"("clienteId", "estado");

CREATE INDEX "EnvioDespacho_estado_actualizadoEn_idx"
  ON "EnvioDespacho"("estado", "actualizadoEn");

CREATE UNIQUE INDEX "EnvioDespacho_envioId_secuencia_key"
  ON "EnvioDespacho"("envioId", "secuencia");

CREATE UNIQUE INDEX "EnvioEvento_claveIdempotencia_key"
  ON "EnvioEvento"("claveIdempotencia");

CREATE INDEX "EnvioEvento_tipo_creadoEn_idx"
  ON "EnvioEvento"("tipo", "creadoEn");

CREATE INDEX "EnvioEvento_usuarioId_creadoEn_idx"
  ON "EnvioEvento"("usuarioId", "creadoEn");

CREATE INDEX "Transportista_empresaId_activo_nombre_idx"
  ON "Transportista"("empresaId", "activo", "nombre");

CREATE UNIQUE INDEX "Transportista_empresaId_codigo_key"
  ON "Transportista"("empresaId", "codigo");

CREATE INDEX "Vehiculo_transportistaId_estado_activo_idx"
  ON "Vehiculo"("transportistaId", "estado", "activo");

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE "Entrega"
  ADD CONSTRAINT "Entrega_envioDespachoId_fkey"
  FOREIGN KEY ("envioDespachoId")
  REFERENCES "EnvioDespacho"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_bodegaId_fkey"
  FOREIGN KEY ("bodegaId")
  REFERENCES "Bodega"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_asignadoPorId_fkey"
  FOREIGN KEY ("asignadoPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_cargaConfirmadaPorId_fkey"
  FOREIGN KEY ("cargaConfirmadaPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_iniciadoPorId_fkey"
  FOREIGN KEY ("iniciadoPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_completadoPorId_fkey"
  FOREIGN KEY ("completadoPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_canceladoPorId_fkey"
  FOREIGN KEY ("canceladoPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_clienteId_fkey"
  FOREIGN KEY ("clienteId")
  REFERENCES "Cliente"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_envioDespachoId_fkey"
  FOREIGN KEY ("envioDespachoId")
  REFERENCES "EnvioDespacho"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_ordenDespachoDetalleId_fkey"
  FOREIGN KEY ("ordenDespachoDetalleId")
  REFERENCES "OrdenDespachoDetalle"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_productoId_fkey"
  FOREIGN KEY ("productoId")
  REFERENCES "Producto"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_envioId_fkey"
  FOREIGN KEY ("envioId")
  REFERENCES "Envio"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_reportadaPorId_fkey"
  FOREIGN KEY ("reportadaPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_resueltaPorId_fkey"
  FOREIGN KEY ("resueltaPorId")
  REFERENCES "Usuario"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

-- ----------------------------
-- Transportista
-- ----------------------------

ALTER TABLE "Transportista"
  ADD CONSTRAINT "Transportista_version_no_negativa"
  CHECK ("version" >= 0);

ALTER TABLE "Transportista"
  ADD CONSTRAINT "Transportista_codigo_no_vacio"
  CHECK (
    "codigo" IS NULL
    OR LENGTH(TRIM("codigo")) > 0
  );

-- ----------------------------
-- Vehiculo
-- ----------------------------

ALTER TABLE "Vehiculo"
  ADD CONSTRAINT "Vehiculo_version_no_negativa"
  CHECK ("version" >= 0);

ALTER TABLE "Vehiculo"
  ADD CONSTRAINT "Vehiculo_capacidad_positiva"
  CHECK (
    "capacidadKg" IS NULL
    OR "capacidadKg" > 0
  );

-- ----------------------------
-- Conductor
-- ----------------------------

ALTER TABLE "Conductor"
  ADD CONSTRAINT "Conductor_version_no_negativa"
  CHECK ("version" >= 0);

-- ----------------------------
-- Envio
-- ----------------------------

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_version_no_negativa"
  CHECK ("version" >= 0);

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_numero_no_vacio"
  CHECK (LENGTH(TRIM("numero")) > 0);

ALTER TABLE "Envio"
  ADD CONSTRAINT "Envio_costo_no_negativo"
  CHECK (
    "costo" IS NULL
    OR "costo" >= 0
  );

-- ----------------------------
-- EnvioDespacho
-- ----------------------------

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_secuencia_positiva"
  CHECK ("secuencia" > 0);

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_version_no_negativa"
  CHECK ("version" >= 0);

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_destinatario_no_vacio"
  CHECK (LENGTH(TRIM("destinatario")) > 0);

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_direccion_no_vacia"
  CHECK (LENGTH(TRIM("direccionDestino")) > 0);

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_latitud_valida"
  CHECK (
    "latitudDestino" IS NULL
    OR ("latitudDestino" >= -90 AND "latitudDestino" <= 90)
  );

ALTER TABLE "EnvioDespacho"
  ADD CONSTRAINT "EnvioDespacho_longitud_valida"
  CHECK (
    "longitudDestino" IS NULL
    OR ("longitudDestino" >= -180 AND "longitudDestino" <= 180)
  );

-- ----------------------------
-- EnvioCargaDetalle
-- ----------------------------

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_planificada_positiva"
  CHECK ("cantidadPlanificada" > 0);

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_cargada_valida"
  CHECK (
    "cantidadCargada" >= 0
    AND "cantidadCargada" <= "cantidadPlanificada"
  );

ALTER TABLE "EnvioCargaDetalle"
  ADD CONSTRAINT "EnvioCargaDetalle_version_no_negativa"
  CHECK ("version" >= 0);

-- ----------------------------
-- EnvioEvento
-- ----------------------------

ALTER TABLE "EnvioEvento"
  ADD CONSTRAINT "EnvioEvento_clave_idempotencia_no_vacia"
  CHECK (
    "claveIdempotencia" IS NULL
    OR LENGTH(TRIM("claveIdempotencia")) > 0
  );

ALTER TABLE "EnvioEvento"
  ADD CONSTRAINT "EnvioEvento_latitud_valida"
  CHECK (
    "latitud" IS NULL
    OR ("latitud" >= -90 AND "latitud" <= 90)
  );

ALTER TABLE "EnvioEvento"
  ADD CONSTRAINT "EnvioEvento_longitud_valida"
  CHECK (
    "longitud" IS NULL
    OR ("longitud" >= -180 AND "longitud" <= 180)
  );

-- ----------------------------
-- EnvioIncidencia
-- ----------------------------

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_descripcion_no_vacia"
  CHECK (LENGTH(TRIM("descripcion")) > 0);

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_version_no_negativa"
  CHECK ("version" >= 0);

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_clave_idempotencia_no_vacia"
  CHECK (
    "claveIdempotencia" IS NULL
    OR LENGTH(TRIM("claveIdempotencia")) > 0
  );

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_latitud_valida"
  CHECK (
    "latitud" IS NULL
    OR ("latitud" >= -90 AND "latitud" <= 90)
  );

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_longitud_valida"
  CHECK (
    "longitud" IS NULL
    OR ("longitud" >= -180 AND "longitud" <= 180)
  );

ALTER TABLE "EnvioIncidencia"
  ADD CONSTRAINT "EnvioIncidencia_resuelta_consistente"
  CHECK (
    "estado" <> 'RESUELTA'
    OR (
      "resueltaEn" IS NOT NULL
      AND "resolucion" IS NOT NULL
      AND LENGTH(TRIM("resolucion")) > 0
    )
  );
