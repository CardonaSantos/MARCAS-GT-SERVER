import { PageResult, SortDirection } from 'src/shared/application/pagination/page.models';
import {
  OrderEventType,
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../order.types';

export type OrderSortField =
  | 'creadoEn'
  | 'actualizadoEn'
  | 'numero'
  | 'estado'
  | 'estadoPago'
  | 'cliente'
  | 'vendedor'
  | 'total';

export type OrderListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: OrderState;
  estadoPago?: OrderPaymentState;
  condicionPago?: OrderPaymentCondition;
  clienteId?: number;
  vendedorId?: number;
  visitaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  soloAbiertos?: boolean;
  sortBy: OrderSortField;
  sortDir: SortDirection;
  empresaId: number;
}>;

export type OrderEventFilters = Readonly<{
  page: number;
  limit: number;
  tipo?: OrderEventType;
  usuarioId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;

export type OrderSummaryFilters = Readonly<{
  estado?: OrderState;
  estadoPago?: OrderPaymentState;
  condicionPago?: OrderPaymentCondition;
  clienteId?: number;
  vendedorId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
}>;

export type OrderCustomerView = Readonly<{
  id: number;
  nombre: string;
  apellido: string | null;
  nombreCompleto: string;
  telefono: string;
  correo: string | null;
  direccion: string;
}>;

export type OrderUserView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}>;

export type OrderProductView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type OrderProgressView = Readonly<{
  productos: number;
  unidadesSolicitadas: number;
  unidadesReservadas: number;
  unidadesDespachadas: number;
  unidadesEntregadas: number;
  unidadesPendientesReserva: number;
  unidadesPendientesDespacho: number;
  unidadesPendientesEntrega: number;
  porcentajeReservado: number;
  porcentajeDespachado: number;
  porcentajeEntregado: number;
}>;

export type OrderActionsView = Readonly<{
  puedeEditar: boolean;
  puedeSolicitarValidacion: boolean;
  puedeConfirmar: boolean;
  puedeCancelar: boolean;
  requiereCredito: boolean;
}>;

export type OrderListItemView = Readonly<{
  id: number;
  numero: string;
  estado: OrderState;
  condicionPago: OrderPaymentCondition;
  estadoPago: OrderPaymentState;
  cliente: OrderCustomerView;
  vendedor: OrderUserView;
  visita: Readonly<{
    id: number;
    inicio: Date;
    fin: Date | null;
    estado: string;
  }> | null;
  progreso: OrderProgressView;
  subtotal: string;
  descuentoTotal: string;
  total: string;
  moneda: string;
  credito: Readonly<{
    solicitudId: number;
    estado: string;
    montoSolicitado: string;
  }> | null;
  despacho: Readonly<{
    ordenId: number;
    estado: string;
    bodega: { id: number; codigo: string; nombre: string };
    preparadoPor: OrderUserView | null;
    preparadoEn: Date | null;
    despachadoEn: Date | null;
  }> | null;
  entrega: Readonly<{
    id: number;
    estado: string;
    entregadoEn: Date | null;
  }> | null;
  pagos: Readonly<{
    cantidad: number;
    montoRegistrado: string;
    montoVerificado: string;
    montoPendienteEstimado: string;
  }>;
  factura: Readonly<{
    id: number;
    estado: string;
    serie: string | null;
    numero: string | null;
    total: string;
    emitidaEn: Date | null;
  }> | null;
  observaciones: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type OrderDetailLineView = Readonly<{
  id: number;
  producto: OrderProductView;
  cantidadSolicitada: number;
  cantidadReservada: number;
  cantidadDespachada: number;
  cantidadEntregada: number;
  cantidadPendienteReserva: number;
  cantidadPendienteDespacho: number;
  cantidadPendienteEntrega: number;
  porcentajeReservado: number;
  porcentajeDespachado: number;
  porcentajeEntregado: number;
  precioUnitario: string;
  descuento: string;
  subtotal: string;
  observaciones: string | null;
  version: number;
}>;

export type OrderEventView = Readonly<{
  id: number;
  tipo: OrderEventType;
  detalle: string | null;
  actor: OrderUserView | null;
  referencia: Readonly<{ tipo: string; id: number }> | null;
  creadoEn: Date;
}>;

export type OrderEventPage = PageResult<OrderEventView>;
export type OrderPage = PageResult<OrderListItemView>;

export type OrderDetailView = Readonly<
  OrderListItemView & {
    validacionSolicitadaEn: Date | null;
    confirmadoEn: Date | null;
    canceladoEn: Date | null;
    motivoCancelacion: string | null;
    version: number;
    detalles: OrderDetailLineView[];
    solicitudesCredito: ReadonlyArray<{
      id: number;
      estado: string;
      montoSolicitado: string;
      plazoDias: number;
      anticipoPropuesto: string;
      solicitadaEn: Date;
      resueltaEn: Date | null;
    }>;
    despachos: ReadonlyArray<{
      id: number;
      estado: string;
      bodega: { id: number; codigo: string; nombre: string };
      preparadoPor: OrderUserView | null;
      programadoEn: Date | null;
      preparadoEn: Date | null;
      despachadoEn: Date | null;
      creadoEn: Date;
    }>;
    entregas: ReadonlyArray<{
      id: number;
      estado: string;
      registradoPor: OrderUserView | null;
      entregadoEn: Date | null;
      creadoEn: Date;
    }>;
    pagosDetalle: ReadonlyArray<{
      id: number;
      metodo: string;
      estado: string;
      monto: string;
      referencia: string | null;
      fechaPago: Date;
      verificadoEn: Date | null;
    }>;
    facturas: ReadonlyArray<{
      id: number;
      estado: string;
      serie: string | null;
      numero: string | null;
      total: string;
      emitidaEn: Date | null;
      fechaVencimiento: Date | null;
    }>;
    ultimosEventos: OrderEventView[];
    acciones: OrderActionsView;
  }
>;

export type OrderSummaryView = Readonly<{
  totalPedidos: number;
  montos: {
    subtotal: string;
    descuentoTotal: string;
    total: string;
    pagadoVerificado: string;
    pendienteEstimado: string;
  };
  unidades: {
    solicitadas: number;
    reservadas: number;
    despachadas: number;
    entregadas: number;
  };
  porEstado: Record<OrderState, number>;
  porEstadoPago: Record<OrderPaymentState, number>;
  porCondicionPago: Record<OrderPaymentCondition, number>;
  topVendedores: ReadonlyArray<{
    vendedor: OrderUserView;
    pedidos: number;
    monto: string;
  }>;
  topProductos: ReadonlyArray<{
    producto: OrderProductView;
    unidadesSolicitadas: number;
    montoNeto: string;
  }>;
}>;

export type CreateOrderLineInput = Readonly<{
  productoId: number;
  cantidadSolicitada: number;
  descuento?: string;
  observaciones?: string | null;
}>;

export type CreateOrderCommand = Readonly<{
  clienteId: number;
  vendedorId?: number;
  visitaId?: number | null;
  condicionPago: OrderPaymentCondition;
  observaciones?: string | null;
  detalles?: CreateOrderLineInput[];
  actorId: number;
}>;

export type UpdateOrderCommand = Readonly<{
  id: number;
  clienteId?: number;
  vendedorId?: number;
  visitaId?: number | null;
  condicionPago?: OrderPaymentCondition;
  observaciones?: string | null;
  detalles?: CreateOrderLineInput[];
  actorId: number;
}>;
