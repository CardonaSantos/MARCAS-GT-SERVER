import {
  PageResult,
  SortDirection,
} from 'src/shared/application/pagination/page.models';
import {
  DispatchEventType,
  DispatchOperationState,
  DispatchOperationType,
  DispatchState,
} from '../../dispatch.types';

export type DispatchSortField =
  | 'creadoEn'
  | 'actualizadoEn'
  | 'numero'
  | 'estado'
  | 'programadoEn'
  | 'pedido'
  | 'cliente'
  | 'bodega'
  | 'preparadoEn'
  | 'despachadoEn';

export type DispatchListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: DispatchState;
  bodegaId?: number;
  pedidoId?: number;
  clienteId?: number;
  vendedorId?: number;
  creadoPorId?: number;
  preparadoPorId?: number;
  despachadoPorId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  programadoDesde?: Date;
  programadoHasta?: Date;
  soloPendientes?: boolean;
  soloAtrasados?: boolean;
  conPendientePreparacion?: boolean;
  conPendienteDespacho?: boolean;
  sortBy: DispatchSortField;
  sortDir: SortDirection;
  empresaId: number;
}>;

export type DispatchEventFilters = Readonly<{
  page: number;
  limit: number;
  tipo?: DispatchEventType;
  usuarioId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;

export type DispatchOperationFilters = Readonly<{
  page: number;
  limit: number;
  dispatchId?: number;
  tipo?: DispatchOperationType;
  estado?: DispatchOperationState;
  usuarioId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;

export type DispatchSummaryFilters = Readonly<{
  bodegaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;

export type DispatchCandidateFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  bodegaId?: number;
  clienteId?: number;
  vendedorId?: number;
  empresaId: number;
}>;

export type DispatchUserView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}>;

export type DispatchWarehouseView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  esPrincipal: boolean;
}>;

export type DispatchCustomerView = Readonly<{
  id: number;
  nombre: string;
  apellido: string | null;
  nombreCompleto: string;
  telefono: string;
  correo: string | null;
  direccion: string;
}>;

export type DispatchProductView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type DispatchProgressView = Readonly<{
  productos: number;
  unidadesProgramadas: number;
  unidadesPreparadas: number;
  unidadesDespachadas: number;
  unidadesPendientesPreparacion: number;
  unidadesPendientesDespacho: number;
  porcentajePreparacion: number;
  porcentajeDespacho: number;
}>;

export type DispatchTimingView = Readonly<{
  creadoEn: Date;
  programadoEn: Date | null;
  preparacionIniciadaEn: Date | null;
  preparadoEn: Date | null;
  despachadoEn: Date | null;
  canceladoEn: Date | null;
  actualizadoEn: Date;
  atrasado: boolean;
  horasAtraso: number;
  horasEsperaPreparacion: number | null;
  horasPreparacion: number | null;
  horasEsperaSalida: number | null;
  horasCicloTotal: number | null;
  horasDesdeActualizacion: number;
}>;

export type DispatchListItemView = Readonly<{
  id: number;
  numero: string;
  estado: DispatchState;
  pedido: {
    id: number;
    numero: string;
    estado: string;
    condicionPago: string;
    estadoPago: string;
    total: string;
    vendedor: DispatchUserView;
  };
  cliente: DispatchCustomerView;
  bodega: DispatchWarehouseView;
  creadoPor: DispatchUserView | null;
  preparadoPor: DispatchUserView | null;
  despachadoPor: DispatchUserView | null;
  progreso: DispatchProgressView;
  tiempos: DispatchTimingView;
  operaciones: {
    total: number;
    pendientes: number;
    aplicando: number;
    fallidas: number;
    ultimaOperacion: {
      id: number;
      tipo: DispatchOperationType;
      estado: DispatchOperationState;
      ocurridaEn: Date;
    } | null;
  };
  observaciones: string | null;
  ultimaActividad: {
    tipo: DispatchEventType;
    actor: DispatchUserView | null;
    creadoEn: Date;
  } | null;
}>;

export type DispatchEventView = Readonly<{
  id: number;
  tipo: DispatchEventType;
  detalle: string | null;
  actor: DispatchUserView | null;
  referencia: { tipo: string; id: number } | null;
  metadata: unknown;
  creadoEn: Date;
}>;

export type DispatchOperationView = Readonly<{
  id: number;
  ordenDespachoId: number;
  numeroDespacho: string;
  tipo: DispatchOperationType;
  estado: DispatchOperationState;
  usuario: DispatchUserView;
  claveIdempotencia: string;
  observaciones: string | null;
  ocurridaEn: Date;
  iniciadaEn: Date | null;
  ultimoIntentoEn: Date | null;
  aplicadaEn: Date | null;
  fallidaEn: Date | null;
  intentos: number;
  errorAplicacion: string | null;
  version: number;
  detalles: Array<{
    id: number;
    ordenDespachoDetalleId: number;
    producto: DispatchProductView;
    cantidad: number;
    estado: string;
    reservaInventarioId: number | null;
    movimientoInventarioId: number | null;
    claveIdempotencia: string;
    aplicadaEn: Date | null;
    errorAplicacion: string | null;
    actualizadoEn: Date;
  }>;
  unidades: number;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type DispatchDetailView = DispatchListItemView &
  Readonly<{
    version: number;
    motivoCancelacion: string | null;
    canceladoPor: DispatchUserView | null;
    detalles: Array<{
      id: number;
      pedidoDetalleId: number;
      producto: DispatchProductView;
      pedido: {
        cantidadSolicitada: number;
        cantidadReservada: number;
        cantidadDespachada: number;
        cantidadEntregada: number;
      };
      despacho: {
        cantidadProgramada: number;
        cantidadPreparada: number;
        cantidadDespachada: number;
        pendientePreparar: number;
        pendienteDespachar: number;
        porcentajePreparacion: number;
        porcentajeDespacho: number;
      };
      inventario: {
        stockId: number | null;
        real: number;
        reservado: number;
        disponible: number;
        reserva: {
          id: number;
          estado: string;
          cantidadOriginal: number;
          cantidadPendiente: number;
          cantidadAplicada: number;
          cantidadLiberada: number;
        } | null;
      };
      observaciones: string | null;
      version: number;
      creadoEn: Date;
      actualizadoEn: Date;
    }>;
    operacionesRecientes: DispatchOperationView[];
    eventosRecientes: DispatchEventView[];
    envios: Array<{
      id: number;
      estado: string;
      guia: string | null;
      salidaEn: Date | null;
      completadoEn: Date | null;
      creadoEn: Date;
    }>;
    entregas: Array<{
      id: number;
      estado: string;
      receptorNombre: string | null;
      entregadoEn: Date | null;
      creadoEn: Date;
    }>;
    acciones: {
      puedeEditar: boolean;
      puedeIniciarPreparacion: boolean;
      puedeActualizarPreparacion: boolean;
      puedeFinalizarPreparacion: boolean;
      puedeDespachar: boolean;
      puedeCancelar: boolean;
      puedeAgregarObservacion: boolean;
    };
    advertencias: Array<{
      codigo: string;
      nivel: 'INFO' | 'ADVERTENCIA' | 'CRITICO';
      mensaje: string;
    }>;
  }>;

export type DispatchSummaryView = Readonly<{
  totalOrdenes: number;
  porEstado: Record<DispatchState, number>;
  abiertas: number;
  atrasadas: number;
  unidades: {
    programadas: number;
    preparadas: number;
    despachadas: number;
    pendientesPreparacion: number;
    pendientesDespacho: number;
  };
  porcentajes: { preparacion: number; despacho: number };
  tiemposPromedioHoras: {
    esperaPreparacion: number | null;
    preparacion: number | null;
    esperaSalida: number | null;
    cicloCompleto: number | null;
  };
  operaciones: {
    total: number;
    pendientes: number;
    aplicando: number;
    aplicadas: number;
    fallidas: number;
  };
  hoy: {
    programadas: number;
    creadas: number;
    preparadas: number;
    despachadas: number;
    atrasadas: number;
    preparandoAhora: number;
    preparadasEsperandoSalida: number;
  };
  topBodegas: Array<{
    bodega: DispatchWarehouseView;
    ordenes: number;
    unidadesDespachadas: number;
  }>;
  topOperadores: Array<{
    usuario: DispatchUserView;
    operacionesAplicadas: number;
    unidadesProcesadas: number;
  }>;
}>;

export type DispatchCandidateView = Readonly<{
  pedido: {
    id: number;
    numero: string;
    estado: string;
    condicionPago: string;
    estadoPago: string;
    total: string;
    vendedor: DispatchUserView;
    confirmadoEn: Date | null;
    creadoEn: Date;
  };
  cliente: DispatchCustomerView;
  lineas: Array<{
    pedidoDetalleId: number;
    producto: DispatchProductView;
    cantidadSolicitada: number;
    cantidadReservada: number;
    cantidadDespachada: number;
    cantidadEntregada: number;
    cantidadProgramadaActiva: number;
    cantidadPendientePlanificar: number;
    disponibilidadBodega: {
      bodegaId: number;
      stockId: number | null;
      real: number;
      reservado: number;
      disponible: number;
      suficienteParaPendiente: boolean;
    } | null;
  }>;
  totales: {
    unidadesSolicitadas: number;
    unidadesDespachadas: number;
    unidadesProgramadasActivas: number;
    unidadesPendientesPlanificar: number;
  };
}>;

export type DispatchOperationalReportFilters = Readonly<{
  bodegaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;

export type DispatchOperationalReportView = Readonly<{
  rango: {
    desde: Date;
    hasta: Date;
    dias: number;
  };
  puntualidad: {
    despachadas: number;
    aTiempo: number;
    tarde: number;
    sinProgramacion: number;
    porcentajeATiempo: number;
  };
  colaAbierta: {
    total: number;
    menos4h: number;
    de4a8h: number;
    de8a24h: number;
    de24a48h: number;
    mas48h: number;
  };
  confiabilidadOperaciones: {
    total: number;
    aplicadas: number;
    fallidas: number;
    conReintentos: number;
    tasaFallo: number;
    porcentajeConReintento: number;
    intentosPromedio: number;
  };
  tendenciaDiaria: ReadonlyArray<{
    fecha: string;
    creadas: number;
    preparadas: number;
    despachadas: number;
    unidadesDespachadas: number;
    fallosOperacion: number;
  }>;
  bodegas: ReadonlyArray<{
    bodega: DispatchWarehouseView;
    ordenes: number;
    despachadas: number;
    unidadesDespachadas: number;
    porcentajeATiempo: number;
    horasPromedioPreparacion: number | null;
    horasPromedioCiclo: number | null;
  }>;
}>;

export type CreateDispatchLineInput = Readonly<{
  pedidoDetalleId: number;
  cantidadProgramada: number;
  observaciones?: string | null;
}>;

export type CreateDispatchCommand = Readonly<{
  pedidoId: number;
  bodegaId: number;
  programadoEn?: Date | null;
  observaciones?: string | null;
  detalles: readonly CreateDispatchLineInput[];
  actorId: number;
}>;

export type UpdateDispatchCommand = Readonly<{
  id: number;
  bodegaId?: number;
  programadoEn?: Date | null;
  observaciones?: string | null;
  detalles?: readonly CreateDispatchLineInput[];
  actorId: number;
}>;

export type StartDispatchPreparationCommand = Readonly<{
  id: number;
  claveIdempotencia: string;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  actorId: number;
}>;

export type UpdateDispatchPreparationCommand = Readonly<{
  id: number;
  detalles: readonly {
    detalleId: number;
    cantidadPreparada: number;
    observaciones?: string | null;
  }[];
  actorId: number;
}>;

export type RegisterDispatchOutputCommand = Readonly<{
  id: number;
  claveIdempotencia: string;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  detalles: readonly {
    detalleId: number;
    cantidad: number;
  }[];
  actorId: number;
}>;

export type CancelDispatchCommand = Readonly<{
  id: number;
  motivo: string;
  claveIdempotencia: string;
  ocurridaEn?: Date | null;
  actorId: number;
}>;

export type AddDispatchObservationCommand = Readonly<{
  id: number;
  detalle: string;
  actorId: number;
}>;

export type DispatchPage = PageResult<DispatchListItemView>;
export type DispatchEventPage = PageResult<DispatchEventView>;
export type DispatchOperationPage = PageResult<DispatchOperationView>;
export type DispatchCandidatePage = PageResult<DispatchCandidateView>;
