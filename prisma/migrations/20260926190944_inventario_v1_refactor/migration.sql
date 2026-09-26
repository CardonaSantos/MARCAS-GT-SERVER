-- ============================================================
-- INVENTARIO V1
-- Refactor de stock, reservas y movimientos
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

ALTER TYPE "EstadoReservaInventario"
ADD VALUE 'PARCIAL';

ALTER TYPE "EstadoReservaInventario"
ADD VALUE 'FINALIZADA_MIXTA';

ALTER TYPE "TipoMovimientoInventario"
ADD VALUE 'MIGRACION_INICIAL';


-- ============================================================
-- RESERVA INVENTARIO
-- ============================================================

-- Cambiamos la política de borrado de PedidoDetalle.
-- Una reserva forma parte del historial operativo y no debe
-- desaparecer por cascade.
ALTER TABLE "ReservaInventario"
DROP CONSTRAINT "ReservaInventario_pedidoDetalleId_fkey";


-- IMPORTANTE:
-- Esto es un rename real. No hacemos DROP de "cantidad".
ALTER TABLE "ReservaInventario"
RENAME COLUMN "cantidad" TO "cantidadOriginal";


-- Primero agregamos cantidadPendiente como nullable para poder
-- migrar registros históricos de forma segura.
ALTER TABLE "ReservaInventario"
ADD COLUMN "canceladaEn" TIMESTAMP(3),
ADD COLUMN "cantidadAplicada" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cantidadLiberada" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cantidadPendiente" INTEGER,
ADD COLUMN "cerradaEn" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;


-- ------------------------------------------------------------
-- BACKFILL DE RESERVAS EXISTENTES
-- ------------------------------------------------------------

-- Reserva que sigue activa:
-- toda la cantidad original continúa pendiente.
UPDATE "ReservaInventario"
SET
  "cantidadPendiente" = "cantidadOriginal",
  "cantidadAplicada" = 0,
  "cantidadLiberada" = 0
WHERE "estado" = 'ACTIVA';


-- Reserva que históricamente ya fue aplicada:
-- toda la cantidad terminó consumida.
UPDATE "ReservaInventario"
SET
  "cantidadPendiente" = 0,
  "cantidadAplicada" = "cantidadOriginal",
  "cantidadLiberada" = 0,
  "cerradaEn" = COALESCE("aplicadaEn", "actualizadoEn")
WHERE "estado" = 'APLICADA';


-- Reserva que históricamente fue liberada:
-- toda la cantidad volvió a disponibilidad.
UPDATE "ReservaInventario"
SET
  "cantidadPendiente" = 0,
  "cantidadAplicada" = 0,
  "cantidadLiberada" = "cantidadOriginal",
  "cerradaEn" = COALESCE("liberadaEn", "actualizadoEn")
WHERE "estado" = 'LIBERADA';


-- Reserva históricamente cancelada:
-- consideramos liberada la cantidad que ya no quedó reservada.
UPDATE "ReservaInventario"
SET
  "cantidadPendiente" = 0,
  "cantidadAplicada" = 0,
  "cantidadLiberada" = "cantidadOriginal",
  "canceladaEn" = COALESCE("liberadaEn", "actualizadoEn"),
  "cerradaEn" = COALESCE("liberadaEn", "actualizadoEn")
WHERE "estado" = 'CANCELADA';


-- Seguridad adicional para cualquier registro histórico
-- inesperado que no haya entrado en los estados anteriores.
UPDATE "ReservaInventario"
SET "cantidadPendiente" = "cantidadOriginal"
WHERE "cantidadPendiente" IS NULL;


ALTER TABLE "ReservaInventario"
ALTER COLUMN "cantidadPendiente" SET NOT NULL;


-- Nueva FK con RESTRICT.
ALTER TABLE "ReservaInventario"
ADD CONSTRAINT "ReservaInventario_pedidoDetalleId_fkey"
FOREIGN KEY ("pedidoDetalleId")
REFERENCES "PedidoDetalle"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- ============================================================
-- STOCK BODEGA
-- ============================================================

ALTER TABLE "StockBodega"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "costoPromedio" SET DATA TYPE DECIMAL(14,4);


-- Prisma reemplazó el índice simple de producto por uno
-- más útil para consultas de disponibilidad.
DROP INDEX "StockBodega_productoId_idx";

CREATE INDEX "StockBodega_bodegaId_cantidadDisponible_idx"
ON "StockBodega"("bodegaId", "cantidadDisponible");

CREATE INDEX "StockBodega_productoId_cantidadDisponible_idx"
ON "StockBodega"("productoId", "cantidadDisponible");


-- ============================================================
-- MOVIMIENTO INVENTARIO
-- ============================================================

ALTER TABLE "MovimientoInventario"
ADD COLUMN "claveIdempotencia" TEXT,
ADD COLUMN "costoPromedioAntes" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "costoPromedioDespues" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "reservaInventarioId" INTEGER,
ALTER COLUMN "costoUnitario" SET DATA TYPE DECIMAL(14,4);


-- PostgreSQL permite múltiples NULL en este índice.
-- Solo las claves reales deben ser únicas.
CREATE UNIQUE INDEX "MovimientoInventario_claveIdempotencia_key"
ON "MovimientoInventario"("claveIdempotencia");


CREATE INDEX "MovimientoInventario_productoId_creadoEn_idx"
ON "MovimientoInventario"("productoId", "creadoEn");

CREATE INDEX "MovimientoInventario_bodegaId_creadoEn_idx"
ON "MovimientoInventario"("bodegaId", "creadoEn");

CREATE INDEX "MovimientoInventario_reservaInventarioId_creadoEn_idx"
ON "MovimientoInventario"("reservaInventarioId", "creadoEn");

CREATE INDEX "MovimientoInventario_creadoPorId_creadoEn_idx"
ON "MovimientoInventario"("creadoPorId", "creadoEn");


ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_reservaInventarioId_fkey"
FOREIGN KEY ("reservaInventarioId")
REFERENCES "ReservaInventario"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- ============================================================
-- ÍNDICES DE RESERVAS
-- ============================================================

CREATE INDEX "ReservaInventario_pedidoDetalleId_estado_idx"
ON "ReservaInventario"("pedidoDetalleId", "estado");

CREATE INDEX "ReservaInventario_estado_actualizadoEn_idx"
ON "ReservaInventario"("estado", "actualizadoEn");


-- ============================================================
-- CHECK CONSTRAINTS - STOCK BODEGA
-- ============================================================

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_cantidad_real_no_negativa"
CHECK ("cantidadReal" >= 0);

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_cantidad_reservada_no_negativa"
CHECK ("cantidadReservada" >= 0);

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_cantidad_disponible_no_negativa"
CHECK ("cantidadDisponible" >= 0);

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_reserva_no_supera_real"
CHECK ("cantidadReservada" <= "cantidadReal");

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_disponibilidad_consistente"
CHECK (
  "cantidadDisponible" =
  "cantidadReal" - "cantidadReservada"
);

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_costo_promedio_no_negativo"
CHECK ("costoPromedio" >= 0);

ALTER TABLE "StockBodega"
ADD CONSTRAINT "StockBodega_version_no_negativa"
CHECK ("version" >= 0);


-- ============================================================
-- CHECK CONSTRAINTS - RESERVA INVENTARIO
-- ============================================================

ALTER TABLE "ReservaInventario"
ADD CONSTRAINT "ReservaInventario_original_positiva"
CHECK ("cantidadOriginal" > 0);

ALTER TABLE "ReservaInventario"
ADD CONSTRAINT "ReservaInventario_cantidades_no_negativas"
CHECK (
  "cantidadPendiente" >= 0
  AND "cantidadAplicada" >= 0
  AND "cantidadLiberada" >= 0
);

ALTER TABLE "ReservaInventario"
ADD CONSTRAINT "ReservaInventario_cantidades_consistentes"
CHECK (
  "cantidadOriginal" =
    "cantidadPendiente"
    + "cantidadAplicada"
    + "cantidadLiberada"
);

ALTER TABLE "ReservaInventario"
ADD CONSTRAINT "ReservaInventario_version_no_negativa"
CHECK ("version" >= 0);


-- ============================================================
-- CHECK CONSTRAINTS - MOVIMIENTO INVENTARIO
-- ============================================================

-- La cantidad siempre representa magnitud.
-- El sentido lo determina TipoMovimientoInventario.
ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_cantidad_positiva"
CHECK ("cantidad" > 0);


ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_cantidades_no_negativas"
CHECK (
  "cantidadRealAntes" >= 0
  AND "cantidadRealDespues" >= 0
  AND "reservadaAntes" >= 0
  AND "reservadaDespues" >= 0
);


ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_reservas_validas"
CHECK (
  "reservadaAntes" <= "cantidadRealAntes"
  AND "reservadaDespues" <= "cantidadRealDespues"
);


ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_costos_no_negativos"
CHECK (
  ("costoUnitario" IS NULL OR "costoUnitario" >= 0)
  AND "costoPromedioAntes" >= 0
  AND "costoPromedioDespues" >= 0
);


-- referenciaTipo/referenciaId deben existir juntos.
ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_referencia_consistente"
CHECK (
  (
    "referenciaTipo" IS NULL
    AND "referenciaId" IS NULL
  )
  OR
  (
    "referenciaTipo" IS NOT NULL
    AND "referenciaId" IS NOT NULL
  )
);


ALTER TABLE "MovimientoInventario"
ADD CONSTRAINT "MovimientoInventario_idempotencia_no_vacia"
CHECK (
  "claveIdempotencia" IS NULL
  OR LENGTH(TRIM("claveIdempotencia")) > 0
);


-- ============================================================
-- CHECK CONSTRAINTS - PEDIDO DETALLE
-- ============================================================

ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_cantidades_no_negativas"
CHECK (
  "cantidadSolicitada" > 0
  AND "cantidadReservada" >= 0
  AND "cantidadDespachada" >= 0
  AND "cantidadEntregada" >= 0
);


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_reserva_despacho_valido"
CHECK (
  "cantidadReservada" + "cantidadDespachada"
  <= "cantidadSolicitada"
);


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_entrega_valida"
CHECK (
  "cantidadEntregada" <= "cantidadDespachada"
);