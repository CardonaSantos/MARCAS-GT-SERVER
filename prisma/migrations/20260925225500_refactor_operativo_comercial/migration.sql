-- MARCAS GT
-- Refactor operativo/comercial aditivo.
-- No elimina ni renombra tablas legacy durante este corte.
-- El backfill de Stock -> StockBodega se realiza después de validar producción
-- y crear la Bodega Central correspondiente a la empresa.

ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'BODEGA';
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'CONTABILIDAD';
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'REPARTIDOR';

CREATE TYPE "EstadoSesionTracking" AS ENUM ('ACTIVA', 'FINALIZADA', 'EXPIRADA');
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA_RECEPCION', 'SALIDA_DESPACHO', 'RESERVA', 'LIBERACION_RESERVA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA', 'DEVOLUCION');
CREATE TYPE "EstadoReservaInventario" AS ENUM ('ACTIVA', 'APLICADA', 'LIBERADA', 'CANCELADA');
CREATE TYPE "EstadoRequisicion" AS ENUM ('BORRADOR', 'SOLICITADA', 'APROBADA', 'RECHAZADA', 'PARCIAL', 'COMPLETADA', 'CANCELADA');
CREATE TYPE "EstadoTransferenciaBodega" AS ENUM ('BORRADOR', 'PREPARADA', 'EN_TRANSITO', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'CANCELADA');
CREATE TYPE "EstadoPedido" AS ENUM ('BORRADOR', 'PENDIENTE_VALIDACION', 'CONFIRMADO', 'EN_PREPARACION', 'PARCIALMENTE_DESPACHADO', 'DESPACHADO', 'PARCIALMENTE_ENTREGADO', 'ENTREGADO', 'CANCELADO');
CREATE TYPE "CondicionPago" AS ENUM ('PREPAGO', 'CONTRAENTREGA', 'CREDITO', 'MIXTO');
CREATE TYPE "EstadoPagoComercial" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'REEMBOLSADO', 'ANULADO');
CREATE TYPE "TipoEventoPedido" AS ENUM ('CREADO', 'CONFIRMADO', 'RESERVA_CREADA', 'RESERVA_LIBERADA', 'PREPARACION_INICIADA', 'DESPACHO_PARCIAL', 'DESPACHADO', 'ENTREGA_PARCIAL', 'ENTREGADO', 'CANCELADO', 'OBSERVACION');
CREATE TYPE "MetodoPagoOperacion" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA_BANCO', 'DEPOSITO', 'CHEQUE', 'OTRO');
CREATE TYPE "EstadoPagoTransaccion" AS ENUM ('PENDIENTE', 'VERIFICADO', 'RECHAZADO', 'ANULADO');
CREATE TYPE "EstadoCuentaPorCobrar" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA');
CREATE TYPE "EstadoFactura" AS ENUM ('BORRADOR', 'EMITIDA', 'ANULADA');
CREATE TYPE "EstadoSolicitudCredito" AS ENUM ('PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA');
CREATE TYPE "TipoReferenciaCredito" AS ENUM ('PERSONAL', 'COMERCIAL', 'LABORAL', 'OTRA');
CREATE TYPE "EstadoVerificacionReferencia" AS ENUM ('PENDIENTE', 'VERIFICADA', 'NO_VERIFICADA', 'RECHAZADA');
CREATE TYPE "TipoDocumentoCredito" AS ENUM ('DPI', 'NIT', 'ESTADO_CUENTA', 'CONSTANCIA_INGRESOS', 'PATENTE', 'OTRO');
CREATE TYPE "EstadoDocumentoCredito" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');
CREATE TYPE "TipoDecisionCredito" AS ENUM ('APROBADA', 'RECHAZADA', 'AJUSTADA');
CREATE TYPE "EstadoOrdenDespacho" AS ENUM ('PENDIENTE', 'PREPARANDO', 'PREPARADA', 'DESPACHADA', 'PARCIAL', 'CANCELADA');
CREATE TYPE "TipoEventoOrdenDespacho" AS ENUM ('CREADA', 'PREPARACION_INICIADA', 'PREPARADA', 'DESPACHO_PARCIAL', 'DESPACHADA', 'CANCELADA', 'OBSERVACION');
CREATE TYPE "EstadoEntrega" AS ENUM ('PENDIENTE', 'EN_RUTA', 'PARCIAL', 'ENTREGADA', 'RECHAZADA', 'NO_ENTREGADA', 'CANCELADA');
CREATE TYPE "TipoEvidenciaEntrega" AS ENUM ('FIRMA', 'FOTO', 'DOCUMENTO', 'GPS', 'OTRO');
CREATE TYPE "TipoTransportista" AS ENUM ('INTERNO', 'EXTERNO');
CREATE TYPE "EstadoVehiculo" AS ENUM ('DISPONIBLE', 'RESERVADO', 'EN_RUTA', 'MANTENIMIENTO', 'FUERA_SERVICIO', 'INACTIVO');
CREATE TYPE "EstadoEnvio" AS ENUM ('PROGRAMADO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO_PARCIAL', 'COMPLETADO', 'INCIDENCIA', 'CANCELADO');

CREATE TABLE "SesionTrackingUsuario" (
  "id" SERIAL NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "asistenciaId" INTEGER,
  "estado" "EstadoSesionTracking" NOT NULL DEFAULT 'ACTIVA',
  "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizadaEn" TIMESTAMP(3),
  "ultimoHeartbeatEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motivoCierre" TEXT,
  "dispositivoId" TEXT,
  "plataforma" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SesionTrackingUsuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UbicacionUsuarioHistorial" (
  "id" SERIAL NOT NULL,
  "sesionId" INTEGER NOT NULL,
  "latitud" DECIMAL(10,7) NOT NULL,
  "longitud" DECIMAL(10,7) NOT NULL,
  "precisionM" DECIMAL(10,2),
  "velocidadMps" DECIMAL(10,2),
  "bateriaPct" INTEGER,
  "capturadoEn" TIMESTAMP(3) NOT NULL,
  "persistidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UbicacionUsuarioHistorial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UbicacionUsuarioActual" (
  "id" SERIAL NOT NULL,
  "sesionId" INTEGER NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "latitud" DECIMAL(10,7) NOT NULL,
  "longitud" DECIMAL(10,7) NOT NULL,
  "precisionM" DECIMAL(10,2),
  "velocidadMps" DECIMAL(10,2),
  "bateriaPct" INTEGER,
  "capturadoEn" TIMESTAMP(3) NOT NULL,
  "persistidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UbicacionUsuarioActual_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bodega" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "direccion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockBodega" (
  "id" SERIAL NOT NULL,
  "bodegaId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadReal" INTEGER NOT NULL DEFAULT 0,
  "cantidadReservada" INTEGER NOT NULL DEFAULT 0,
  "cantidadDisponible" INTEGER NOT NULL DEFAULT 0,
  "costoPromedio" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockBodega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Requisicion" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "bodegaDestinoId" INTEGER NOT NULL,
  "proveedorId" INTEGER,
  "solicitanteId" INTEGER NOT NULL,
  "estado" "EstadoRequisicion" NOT NULL DEFAULT 'BORRADOR',
  "observaciones" TEXT,
  "solicitadaEn" TIMESTAMP(3),
  "aprobadaEn" TIMESTAMP(3),
  "completadaEn" TIMESTAMP(3),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Requisicion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RequisicionDetalle" (
  "id" SERIAL NOT NULL,
  "requisicionId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadSolicitada" INTEGER NOT NULL,
  "cantidadRecibida" INTEGER NOT NULL DEFAULT 0,
  "costoEstimado" DECIMAL(12,2),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequisicionDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferenciaBodega" (
  "id" SERIAL NOT NULL,
  "bodegaOrigenId" INTEGER NOT NULL,
  "bodegaDestinoId" INTEGER NOT NULL,
  "creadoPorId" INTEGER NOT NULL,
  "estado" "EstadoTransferenciaBodega" NOT NULL DEFAULT 'BORRADOR',
  "observaciones" TEXT,
  "enviadaEn" TIMESTAMP(3),
  "recibidaEn" TIMESTAMP(3),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransferenciaBodega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferenciaBodegaDetalle" (
  "id" SERIAL NOT NULL,
  "transferenciaId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadSolicitada" INTEGER NOT NULL,
  "cantidadEnviada" INTEGER NOT NULL DEFAULT 0,
  "cantidadRecibida" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TransferenciaBodegaDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovimientoInventario" (
  "id" SERIAL NOT NULL,
  "bodegaId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "proveedorId" INTEGER,
  "creadoPorId" INTEGER,
  "tipo" "TipoMovimientoInventario" NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "costoUnitario" DECIMAL(12,2),
  "cantidadRealAntes" INTEGER NOT NULL,
  "cantidadRealDespues" INTEGER NOT NULL,
  "reservadaAntes" INTEGER NOT NULL,
  "reservadaDespues" INTEGER NOT NULL,
  "referenciaTipo" TEXT,
  "referenciaId" INTEGER,
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pedido" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "vendedorId" INTEGER NOT NULL,
  "visitaId" INTEGER,
  "estado" "EstadoPedido" NOT NULL DEFAULT 'BORRADOR',
  "condicionPago" "CondicionPago" NOT NULL,
  "estadoPago" "EstadoPagoComercial" NOT NULL DEFAULT 'PENDIENTE',
  "moneda" TEXT NOT NULL DEFAULT 'GTQ',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "descuentoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "observaciones" TEXT,
  "confirmadoEn" TIMESTAMP(3),
  "canceladoEn" TIMESTAMP(3),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoDetalle" (
  "id" SERIAL NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadSolicitada" INTEGER NOT NULL,
  "cantidadReservada" INTEGER NOT NULL DEFAULT 0,
  "cantidadDespachada" INTEGER NOT NULL DEFAULT 0,
  "cantidadEntregada" INTEGER NOT NULL DEFAULT 0,
  "precioUnitario" DECIMAL(12,2) NOT NULL,
  "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PedidoDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservaInventario" (
  "id" SERIAL NOT NULL,
  "pedidoDetalleId" INTEGER NOT NULL,
  "stockBodegaId" INTEGER NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "estado" "EstadoReservaInventario" NOT NULL DEFAULT 'ACTIVA',
  "aplicadaEn" TIMESTAMP(3),
  "liberadaEn" TIMESTAMP(3),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservaInventario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoEvento" (
  "id" SERIAL NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "usuarioId" INTEGER,
  "tipo" "TipoEventoPedido" NOT NULL,
  "detalle" TEXT,
  "metadata" JSONB,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PedidoEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoliticaCredito" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "montoMaximo" DECIMAL(12,2),
  "plazoMaximoDias" INTEGER,
  "porcentajeAnticipo" DECIMAL(5,2),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoliticaCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoliticaCreditoRequisito" (
  "id" SERIAL NOT NULL,
  "politicaId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "obligatorio" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PoliticaCreditoRequisito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SolicitudCredito" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "solicitanteId" INTEGER NOT NULL,
  "politicaId" INTEGER,
  "creditoId" INTEGER,
  "montoSolicitado" DECIMAL(12,2) NOT NULL,
  "plazoDias" INTEGER NOT NULL,
  "anticipoPropuesto" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "estado" "EstadoSolicitudCredito" NOT NULL DEFAULT 'PENDIENTE',
  "motivo" TEXT,
  "solicitadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resueltaEn" TIMESTAMP(3),
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolicitudCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferenciaCredito" (
  "id" SERIAL NOT NULL,
  "solicitudId" INTEGER NOT NULL,
  "tipo" "TipoReferenciaCredito" NOT NULL,
  "nombre" TEXT NOT NULL,
  "telefono" TEXT NOT NULL,
  "relacion" TEXT,
  "resultado" "EstadoVerificacionReferencia" NOT NULL DEFAULT 'PENDIENTE',
  "verificadoEn" TIMESTAMP(3),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferenciaCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoCredito" (
  "id" SERIAL NOT NULL,
  "solicitudId" INTEGER NOT NULL,
  "tipo" "TipoDocumentoCredito" NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "estado" "EstadoDocumentoCredito" NOT NULL DEFAULT 'PENDIENTE',
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionCredito" (
  "id" SERIAL NOT NULL,
  "solicitudId" INTEGER NOT NULL,
  "decididoPorId" INTEGER NOT NULL,
  "tipo" "TipoDecisionCredito" NOT NULL,
  "montoAutorizado" DECIMAL(12,2),
  "plazoAutorizadoDias" INTEGER,
  "anticipoRequerido" DECIMAL(12,2),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrdenDespacho" (
  "id" SERIAL NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "bodegaId" INTEGER NOT NULL,
  "preparadoPorId" INTEGER,
  "numero" TEXT,
  "estado" "EstadoOrdenDespacho" NOT NULL DEFAULT 'PENDIENTE',
  "programadoEn" TIMESTAMP(3),
  "preparadoEn" TIMESTAMP(3),
  "despachadoEn" TIMESTAMP(3),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrdenDespacho_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrdenDespachoDetalle" (
  "id" SERIAL NOT NULL,
  "ordenDespachoId" INTEGER NOT NULL,
  "pedidoDetalleId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadPreparada" INTEGER NOT NULL DEFAULT 0,
  "cantidadDespachada" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrdenDespachoDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrdenDespachoEvento" (
  "id" SERIAL NOT NULL,
  "ordenDespachoId" INTEGER NOT NULL,
  "usuarioId" INTEGER,
  "tipo" "TipoEventoOrdenDespacho" NOT NULL,
  "detalle" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrdenDespachoEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Entrega" (
  "id" SERIAL NOT NULL,
  "ordenDespachoId" INTEGER NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "registradoPorId" INTEGER,
  "estado" "EstadoEntrega" NOT NULL DEFAULT 'PENDIENTE',
  "receptorNombre" TEXT,
  "receptorDocumento" TEXT,
  "firmaUrl" TEXT,
  "latitud" DECIMAL(10,7),
  "longitud" DECIMAL(10,7),
  "entregadoEn" TIMESTAMP(3),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntregaDetalle" (
  "id" SERIAL NOT NULL,
  "entregaId" INTEGER NOT NULL,
  "ordenDespachoDetalleId" INTEGER NOT NULL,
  "pedidoDetalleId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "cantidadEntregada" INTEGER NOT NULL,
  "cantidadRechazada" INTEGER NOT NULL DEFAULT 0,
  "motivoRechazo" TEXT,
  CONSTRAINT "EntregaDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntregaEvidencia" (
  "id" SERIAL NOT NULL,
  "entregaId" INTEGER NOT NULL,
  "tipo" "TipoEvidenciaEntrega" NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntregaEvidencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transportista" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "tipo" "TipoTransportista" NOT NULL,
  "nombre" TEXT NOT NULL,
  "telefono" TEXT,
  "correo" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Transportista_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehiculo" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "transportistaId" INTEGER,
  "placa" TEXT NOT NULL,
  "marca" TEXT,
  "modelo" TEXT,
  "capacidadKg" DECIMAL(12,2),
  "estado" "EstadoVehiculo" NOT NULL DEFAULT 'DISPONIBLE',
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conductor" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "transportistaId" INTEGER,
  "nombre" TEXT NOT NULL,
  "telefono" TEXT,
  "licencia" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conductor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Envio" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "transportistaId" INTEGER,
  "vehiculoId" INTEGER,
  "conductorId" INTEGER,
  "responsableId" INTEGER,
  "estado" "EstadoEnvio" NOT NULL DEFAULT 'PROGRAMADO',
  "guia" TEXT,
  "costo" DECIMAL(12,2),
  "trackingUrl" TEXT,
  "comprobanteUrl" TEXT,
  "entregadoTransportistaEn" TIMESTAMP(3),
  "salidaEn" TIMESTAMP(3),
  "completadoEn" TIMESTAMP(3),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Envio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvioDespacho" (
  "id" SERIAL NOT NULL,
  "envioId" INTEGER NOT NULL,
  "ordenDespachoId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnvioDespacho_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvioEvento" (
  "id" SERIAL NOT NULL,
  "envioId" INTEGER NOT NULL,
  "usuarioId" INTEGER,
  "estado" "EstadoEnvio" NOT NULL,
  "descripcion" TEXT,
  "latitud" DECIMAL(10,7),
  "longitud" DECIMAL(10,7),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnvioEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Banco" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "codigo" TEXT,
  "cuenta" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Banco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pago" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "pedidoId" INTEGER,
  "bancoId" INTEGER,
  "registradoPorId" INTEGER,
  "metodo" "MetodoPagoOperacion" NOT NULL,
  "estado" "EstadoPagoTransaccion" NOT NULL DEFAULT 'PENDIENTE',
  "monto" DECIMAL(12,2) NOT NULL,
  "referencia" TEXT,
  "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verificadoEn" TIMESTAMP(3),
  "observaciones" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PagoComprobante" (
  "id" SERIAL NOT NULL,
  "pagoId" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoComprobante_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Factura" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "pedidoId" INTEGER,
  "entregaId" INTEGER,
  "ventaId" INTEGER,
  "numero" TEXT,
  "serie" TEXT,
  "estado" "EstadoFactura" NOT NULL DEFAULT 'BORRADOR',
  "moneda" TEXT NOT NULL DEFAULT 'GTQ',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "impuesto" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "emitidaEn" TIMESTAMP(3),
  "fechaVencimiento" TIMESTAMP(3),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FacturaDetalle" (
  "id" SERIAL NOT NULL,
  "facturaId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  "pedidoDetalleId" INTEGER,
  "entregaDetalleId" INTEGER,
  "cantidad" INTEGER NOT NULL,
  "precioUnitario" DECIMAL(12,2) NOT NULL,
  "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "FacturaDetalle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuentaPorCobrar" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "pedidoId" INTEGER,
  "facturaId" INTEGER,
  "creditoId" INTEGER,
  "numeroDocumento" TEXT,
  "montoOriginal" DECIMAL(12,2) NOT NULL,
  "saldoPendiente" DECIMAL(12,2) NOT NULL,
  "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaVencimiento" TIMESTAMP(3) NOT NULL,
  "estado" "EstadoCuentaPorCobrar" NOT NULL DEFAULT 'PENDIENTE',
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuentaPorCobrar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PagoAplicacion" (
  "id" SERIAL NOT NULL,
  "pagoId" INTEGER NOT NULL,
  "cuentaPorCobrarId" INTEGER NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoAplicacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UbicacionUsuarioActual_sesionId_key" ON "UbicacionUsuarioActual"("sesionId");
CREATE UNIQUE INDEX "UbicacionUsuarioActual_usuarioId_key" ON "UbicacionUsuarioActual"("usuarioId");
CREATE UNIQUE INDEX "Bodega_empresaId_codigo_key" ON "Bodega"("empresaId", "codigo");
CREATE UNIQUE INDEX "StockBodega_bodegaId_productoId_key" ON "StockBodega"("bodegaId", "productoId");
CREATE UNIQUE INDEX "RequisicionDetalle_requisicionId_productoId_key" ON "RequisicionDetalle"("requisicionId", "productoId");
CREATE UNIQUE INDEX "TransferenciaBodegaDetalle_transferenciaId_productoId_key" ON "TransferenciaBodegaDetalle"("transferenciaId", "productoId");
CREATE UNIQUE INDEX "PedidoDetalle_pedidoId_productoId_key" ON "PedidoDetalle"("pedidoId", "productoId");
CREATE UNIQUE INDEX "ReservaInventario_pedidoDetalleId_stockBodegaId_key" ON "ReservaInventario"("pedidoDetalleId", "stockBodegaId");
CREATE UNIQUE INDEX "PoliticaCreditoRequisito_politicaId_codigo_key" ON "PoliticaCreditoRequisito"("politicaId", "codigo");
CREATE UNIQUE INDEX "SolicitudCredito_creditoId_key" ON "SolicitudCredito"("creditoId");
CREATE UNIQUE INDEX "OrdenDespachoDetalle_ordenDespachoId_pedidoDetalleId_key" ON "OrdenDespachoDetalle"("ordenDespachoId", "pedidoDetalleId");
CREATE UNIQUE INDEX "EntregaDetalle_entregaId_ordenDespachoDetalleId_key" ON "EntregaDetalle"("entregaId", "ordenDespachoDetalleId");
CREATE UNIQUE INDEX "Vehiculo_empresaId_placa_key" ON "Vehiculo"("empresaId", "placa");
CREATE UNIQUE INDEX "EnvioDespacho_envioId_ordenDespachoId_key" ON "EnvioDespacho"("envioId", "ordenDespachoId");
CREATE UNIQUE INDEX "Factura_entregaId_key" ON "Factura"("entregaId");
CREATE UNIQUE INDEX "Factura_empresaId_serie_numero_key" ON "Factura"("empresaId", "serie", "numero");
CREATE UNIQUE INDEX "CuentaPorCobrar_facturaId_key" ON "CuentaPorCobrar"("facturaId");
CREATE UNIQUE INDEX "PagoAplicacion_pagoId_cuentaPorCobrarId_key" ON "PagoAplicacion"("pagoId", "cuentaPorCobrarId");

CREATE INDEX "SesionTrackingUsuario_usuarioId_estado_idx" ON "SesionTrackingUsuario"("usuarioId", "estado");
CREATE INDEX "SesionTrackingUsuario_asistenciaId_idx" ON "SesionTrackingUsuario"("asistenciaId");
CREATE INDEX "SesionTrackingUsuario_ultimoHeartbeatEn_idx" ON "SesionTrackingUsuario"("ultimoHeartbeatEn");
CREATE INDEX "UbicacionUsuarioHistorial_sesionId_capturadoEn_idx" ON "UbicacionUsuarioHistorial"("sesionId", "capturadoEn");
CREATE INDEX "Bodega_empresaId_activo_idx" ON "Bodega"("empresaId", "activo");
CREATE INDEX "StockBodega_productoId_idx" ON "StockBodega"("productoId");
CREATE INDEX "Requisicion_empresaId_estado_idx" ON "Requisicion"("empresaId", "estado");
CREATE INDEX "Requisicion_bodegaDestinoId_idx" ON "Requisicion"("bodegaDestinoId");
CREATE INDEX "TransferenciaBodega_bodegaOrigenId_estado_idx" ON "TransferenciaBodega"("bodegaOrigenId", "estado");
CREATE INDEX "TransferenciaBodega_bodegaDestinoId_estado_idx" ON "TransferenciaBodega"("bodegaDestinoId", "estado");
CREATE INDEX "MovimientoInventario_bodegaId_productoId_creadoEn_idx" ON "MovimientoInventario"("bodegaId", "productoId", "creadoEn");
CREATE INDEX "MovimientoInventario_referenciaTipo_referenciaId_idx" ON "MovimientoInventario"("referenciaTipo", "referenciaId");
CREATE INDEX "ReservaInventario_stockBodegaId_estado_idx" ON "ReservaInventario"("stockBodegaId", "estado");
CREATE INDEX "Pedido_empresaId_estado_creadoEn_idx" ON "Pedido"("empresaId", "estado", "creadoEn");
CREATE INDEX "Pedido_clienteId_creadoEn_idx" ON "Pedido"("clienteId", "creadoEn");
CREATE INDEX "Pedido_vendedorId_creadoEn_idx" ON "Pedido"("vendedorId", "creadoEn");
CREATE INDEX "PedidoEvento_pedidoId_creadoEn_idx" ON "PedidoEvento"("pedidoId", "creadoEn");
CREATE INDEX "PoliticaCredito_empresaId_activo_idx" ON "PoliticaCredito"("empresaId", "activo");
CREATE INDEX "SolicitudCredito_empresaId_estado_solicitadaEn_idx" ON "SolicitudCredito"("empresaId", "estado", "solicitadaEn");
CREATE INDEX "SolicitudCredito_pedidoId_idx" ON "SolicitudCredito"("pedidoId");
CREATE INDEX "SolicitudCredito_clienteId_idx" ON "SolicitudCredito"("clienteId");
CREATE INDEX "ReferenciaCredito_solicitudId_resultado_idx" ON "ReferenciaCredito"("solicitudId", "resultado");
CREATE INDEX "DocumentoCredito_solicitudId_tipo_idx" ON "DocumentoCredito"("solicitudId", "tipo");
CREATE INDEX "DecisionCredito_solicitudId_creadoEn_idx" ON "DecisionCredito"("solicitudId", "creadoEn");
CREATE INDEX "OrdenDespacho_pedidoId_estado_idx" ON "OrdenDespacho"("pedidoId", "estado");
CREATE INDEX "OrdenDespacho_bodegaId_estado_idx" ON "OrdenDespacho"("bodegaId", "estado");
CREATE INDEX "OrdenDespachoEvento_ordenDespachoId_creadoEn_idx" ON "OrdenDespachoEvento"("ordenDespachoId", "creadoEn");
CREATE INDEX "Entrega_pedidoId_estado_idx" ON "Entrega"("pedidoId", "estado");
CREATE INDEX "Entrega_ordenDespachoId_idx" ON "Entrega"("ordenDespachoId");
CREATE INDEX "EntregaEvidencia_entregaId_tipo_idx" ON "EntregaEvidencia"("entregaId", "tipo");
CREATE INDEX "Transportista_empresaId_tipo_activo_idx" ON "Transportista"("empresaId", "tipo", "activo");
CREATE INDEX "Vehiculo_empresaId_estado_activo_idx" ON "Vehiculo"("empresaId", "estado", "activo");
CREATE INDEX "Conductor_empresaId_activo_idx" ON "Conductor"("empresaId", "activo");
CREATE INDEX "Envio_empresaId_estado_creadoEn_idx" ON "Envio"("empresaId", "estado", "creadoEn");
CREATE INDEX "Envio_guia_idx" ON "Envio"("guia");
CREATE INDEX "EnvioDespacho_ordenDespachoId_idx" ON "EnvioDespacho"("ordenDespachoId");
CREATE INDEX "EnvioEvento_envioId_creadoEn_idx" ON "EnvioEvento"("envioId", "creadoEn");
CREATE INDEX "Banco_empresaId_activo_idx" ON "Banco"("empresaId", "activo");
CREATE INDEX "Pago_empresaId_estado_fechaPago_idx" ON "Pago"("empresaId", "estado", "fechaPago");
CREATE INDEX "Pago_clienteId_fechaPago_idx" ON "Pago"("clienteId", "fechaPago");
CREATE INDEX "PagoComprobante_pagoId_idx" ON "PagoComprobante"("pagoId");
CREATE INDEX "Factura_empresaId_estado_creadoEn_idx" ON "Factura"("empresaId", "estado", "creadoEn");
CREATE INDEX "Factura_clienteId_creadoEn_idx" ON "Factura"("clienteId", "creadoEn");
CREATE INDEX "FacturaDetalle_facturaId_idx" ON "FacturaDetalle"("facturaId");
CREATE INDEX "CuentaPorCobrar_empresaId_estado_fechaVencimiento_idx" ON "CuentaPorCobrar"("empresaId", "estado", "fechaVencimiento");
CREATE INDEX "CuentaPorCobrar_clienteId_estado_idx" ON "CuentaPorCobrar"("clienteId", "estado");
CREATE INDEX "PagoAplicacion_cuentaPorCobrarId_idx" ON "PagoAplicacion"("cuentaPorCobrarId");

ALTER TABLE "SesionTrackingUsuario" ADD CONSTRAINT "SesionTrackingUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SesionTrackingUsuario" ADD CONSTRAINT "SesionTrackingUsuario_asistenciaId_fkey" FOREIGN KEY ("asistenciaId") REFERENCES "Asistencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UbicacionUsuarioHistorial" ADD CONSTRAINT "UbicacionUsuarioHistorial_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionTrackingUsuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UbicacionUsuarioActual" ADD CONSTRAINT "UbicacionUsuarioActual_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionTrackingUsuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UbicacionUsuarioActual" ADD CONSTRAINT "UbicacionUsuarioActual_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBodega" ADD CONSTRAINT "StockBodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBodega" ADD CONSTRAINT "StockBodega_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_bodegaDestinoId_fkey" FOREIGN KEY ("bodegaDestinoId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Requisicion" ADD CONSTRAINT "Requisicion_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequisicionDetalle" ADD CONSTRAINT "RequisicionDetalle_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "Requisicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequisicionDetalle" ADD CONSTRAINT "RequisicionDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaBodega" ADD CONSTRAINT "TransferenciaBodega_bodegaOrigenId_fkey" FOREIGN KEY ("bodegaOrigenId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaBodega" ADD CONSTRAINT "TransferenciaBodega_bodegaDestinoId_fkey" FOREIGN KEY ("bodegaDestinoId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaBodega" ADD CONSTRAINT "TransferenciaBodega_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferenciaBodegaDetalle" ADD CONSTRAINT "TransferenciaBodegaDetalle_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaBodega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferenciaBodegaDetalle" ADD CONSTRAINT "TransferenciaBodegaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_visitaId_fkey" FOREIGN KEY ("visitaId") REFERENCES "Visita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PedidoDetalle" ADD CONSTRAINT "PedidoDetalle_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoDetalle" ADD CONSTRAINT "PedidoDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_pedidoDetalleId_fkey" FOREIGN KEY ("pedidoDetalleId") REFERENCES "PedidoDetalle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_stockBodegaId_fkey" FOREIGN KEY ("stockBodegaId") REFERENCES "StockBodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoEvento" ADD CONSTRAINT "PedidoEvento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoEvento" ADD CONSTRAINT "PedidoEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PoliticaCredito" ADD CONSTRAINT "PoliticaCredito_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PoliticaCreditoRequisito" ADD CONSTRAINT "PoliticaCreditoRequisito_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "PoliticaCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "PoliticaCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitudCredito" ADD CONSTRAINT "SolicitudCredito_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferenciaCredito" ADD CONSTRAINT "ReferenciaCredito_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoCredito" ADD CONSTRAINT "DocumentoCredito_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCredito" ADD CONSTRAINT "DecisionCredito_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCredito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCredito" ADD CONSTRAINT "DecisionCredito_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrdenDespacho" ADD CONSTRAINT "OrdenDespacho_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenDespacho" ADD CONSTRAINT "OrdenDespacho_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenDespacho" ADD CONSTRAINT "OrdenDespacho_preparadoPorId_fkey" FOREIGN KEY ("preparadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrdenDespachoDetalle" ADD CONSTRAINT "OrdenDespachoDetalle_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdenDespachoDetalle" ADD CONSTRAINT "OrdenDespachoDetalle_pedidoDetalleId_fkey" FOREIGN KEY ("pedidoDetalleId") REFERENCES "PedidoDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenDespachoDetalle" ADD CONSTRAINT "OrdenDespachoDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenDespachoEvento" ADD CONSTRAINT "OrdenDespachoEvento_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdenDespachoEvento" ADD CONSTRAINT "OrdenDespachoEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EntregaDetalle" ADD CONSTRAINT "EntregaDetalle_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntregaDetalle" ADD CONSTRAINT "EntregaDetalle_ordenDespachoDetalleId_fkey" FOREIGN KEY ("ordenDespachoDetalleId") REFERENCES "OrdenDespachoDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntregaDetalle" ADD CONSTRAINT "EntregaDetalle_pedidoDetalleId_fkey" FOREIGN KEY ("pedidoDetalleId") REFERENCES "PedidoDetalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntregaDetalle" ADD CONSTRAINT "EntregaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntregaEvidencia" ADD CONSTRAINT "EntregaEvidencia_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transportista" ADD CONSTRAINT "Transportista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conductor" ADD CONSTRAINT "Conductor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conductor" ADD CONSTRAINT "Conductor_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "Conductor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnvioDespacho" ADD CONSTRAINT "EnvioDespacho_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "Envio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvioDespacho" ADD CONSTRAINT "EnvioDespacho_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnvioEvento" ADD CONSTRAINT "EnvioEvento_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "Envio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvioEvento" ADD CONSTRAINT "EnvioEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Banco" ADD CONSTRAINT "Banco_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "Banco"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PagoComprobante" ADD CONSTRAINT "PagoComprobante_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_pedidoDetalleId_fkey" FOREIGN KEY ("pedidoDetalleId") REFERENCES "PedidoDetalle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaDetalle" ADD CONSTRAINT "FacturaDetalle_entregaDetalleId_fkey" FOREIGN KEY ("entregaDetalleId") REFERENCES "EntregaDetalle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagoAplicacion" ADD CONSTRAINT "PagoAplicacion_cuentaPorCobrarId_fkey" FOREIGN KEY ("cuentaPorCobrarId") REFERENCES "CuentaPorCobrar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
