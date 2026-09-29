/*
  PEDIDOS V1
  Refactor y endurecimiento del agregado comercial Pedido.

  Cambios principales:
  - Nuevos eventos ACTUALIZADO y VALIDACION_SOLICITADA.
  - Número comercial opcional/único.
  - Auditoría de solicitud de validación y cancelación.
  - Concurrencia optimista en Pedido y PedidoDetalle.
  - Observaciones por detalle.
  - Referencias lógicas en PedidoEvento.
  - Índices operativos.
  - CHECK CONSTRAINTS adicionales de montos, versiones y referencias.

  NOTA:
  Las restricciones de cantidades de PedidoDetalle ya fueron creadas por
  la migración inventario_v1_refactor y no se duplican aquí.
*/


-- ============================================================================
-- ENUMS
-- ============================================================================

ALTER TYPE "TipoEventoPedido"
ADD VALUE 'ACTUALIZADO';

ALTER TYPE "TipoEventoPedido"
ADD VALUE 'VALIDACION_SOLICITADA';


-- ============================================================================
-- PEDIDO
-- ============================================================================

ALTER TABLE "Pedido"
ADD COLUMN "motivoCancelacion" TEXT,
ADD COLUMN "numero" TEXT,
ADD COLUMN "validacionSolicitadaEn" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;


-- ============================================================================
-- PEDIDO DETALLE
-- ============================================================================

ALTER TABLE "PedidoDetalle"
ADD COLUMN "observaciones" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;


-- ============================================================================
-- PEDIDO EVENTO
-- ============================================================================

ALTER TABLE "PedidoEvento"
ADD COLUMN "referenciaId" INTEGER,
ADD COLUMN "referenciaTipo" TEXT;


-- ============================================================================
-- ÍNDICES - PEDIDO
-- ============================================================================

CREATE UNIQUE INDEX "Pedido_numero_key"
ON "Pedido"("numero");

CREATE INDEX "Pedido_estado_creadoEn_idx"
ON "Pedido"("estado", "creadoEn");

CREATE INDEX "Pedido_estadoPago_creadoEn_idx"
ON "Pedido"("estadoPago", "creadoEn");

CREATE INDEX "Pedido_visitaId_idx"
ON "Pedido"("visitaId");


-- ============================================================================
-- ÍNDICES - PEDIDO DETALLE
-- ============================================================================

CREATE INDEX "PedidoDetalle_productoId_idx"
ON "PedidoDetalle"("productoId");


-- ============================================================================
-- ÍNDICES - PEDIDO EVENTO
-- ============================================================================

CREATE INDEX "PedidoEvento_tipo_creadoEn_idx"
ON "PedidoEvento"("tipo", "creadoEn");

CREATE INDEX "PedidoEvento_referenciaTipo_referenciaId_idx"
ON "PedidoEvento"("referenciaTipo", "referenciaId");


-- ============================================================================
-- CHECK CONSTRAINTS - PEDIDO
-- ============================================================================

ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_version_no_negativa"
CHECK (
  "version" >= 0
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_montos_no_negativos"
CHECK (
  "subtotal" >= 0
  AND "descuentoTotal" >= 0
  AND "total" >= 0
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_descuento_no_supera_subtotal"
CHECK (
  "descuentoTotal" <= "subtotal"
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_total_consistente"
CHECK (
  "total" = "subtotal" - "descuentoTotal"
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_numero_no_vacio"
CHECK (
  "numero" IS NULL
  OR LENGTH(TRIM("numero")) > 0
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_moneda_no_vacia"
CHECK (
  LENGTH(TRIM("moneda")) > 0
);


ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_motivo_cancelacion_no_vacio"
CHECK (
  "motivoCancelacion" IS NULL
  OR LENGTH(TRIM("motivoCancelacion")) >= 3
);


-- ============================================================================
-- CHECK CONSTRAINTS - PEDIDO DETALLE
-- ============================================================================

/*
  Estas invariantes YA existen desde inventario_v1_refactor:

  PedidoDetalle_cantidades_no_negativas
    cantidadSolicitada > 0
    cantidadReservada >= 0
    cantidadDespachada >= 0
    cantidadEntregada >= 0

  PedidoDetalle_reserva_despacho_valido
    cantidadReservada + cantidadDespachada <= cantidadSolicitada

  PedidoDetalle_entrega_valida
    cantidadEntregada <= cantidadDespachada

  No deben volver a crearse aquí.
*/


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_montos_no_negativos"
CHECK (
  "precioUnitario" >= 0
  AND "descuento" >= 0
  AND "subtotal" >= 0
);


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_descuento_valido"
CHECK (
  "descuento"
  <= ("cantidadSolicitada" * "precioUnitario")
);


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_subtotal_consistente"
CHECK (
  "subtotal"
  =
  ("cantidadSolicitada" * "precioUnitario") - "descuento"
);


ALTER TABLE "PedidoDetalle"
ADD CONSTRAINT "PedidoDetalle_version_no_negativa"
CHECK (
  "version" >= 0
);


-- ============================================================================
-- CHECK CONSTRAINTS - PEDIDO EVENTO
-- ============================================================================

ALTER TABLE "PedidoEvento"
ADD CONSTRAINT "PedidoEvento_referencia_consistente"
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