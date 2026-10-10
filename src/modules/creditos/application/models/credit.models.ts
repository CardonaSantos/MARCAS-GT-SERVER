import {
  PageResult,
  SortDirection,
} from 'src/shared/application/pagination/page.models';
import {
  CreditApplicationState,
  CreditDecisionType,
  CreditEventType,
  CreditIntegrationState,
  CreditPaymentPlanEventType,
  CreditPaymentPlanFrequency,
  CreditPaymentPlanState,
} from '../../credit.types';
export type CreditSortField =
  | 'solicitadaEn'
  | 'actualizadoEn'
  | 'numero'
  | 'estado'
  | 'cliente'
  | 'vendedor'
  | 'solicitante'
  | 'montoSolicitado'
  | 'plazoDias';
export type CreditListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: CreditApplicationState;
  clienteId?: number;
  solicitanteId?: number;
  vendedorId?: number;
  politicaId?: number;
  tipoDecision?: CreditDecisionType;
  integracionEstado?: CreditIntegrationState;
  condicionPago?: 'CREDITO' | 'MIXTO';
  fechaDesde?: Date;
  fechaHasta?: Date;
  soloPendientes?: boolean;
  sortBy: CreditSortField;
  sortDir: SortDirection;
  empresaId: number;
}>;
export type CreditEventFilters = Readonly<{
  page: number;
  limit: number;
  tipo?: CreditEventType;
  usuarioId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
  vendedorId?: number;
}>;
export type CreditSummaryFilters = Readonly<{
  estado?: CreditApplicationState;
  clienteId?: number;
  solicitanteId?: number;
  vendedorId?: number;
  politicaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  empresaId: number;
}>;
export type CreditScope = Readonly<{
  empresaId: number;
  vendedorId?: number;
  role: string;
}>;
export type UserView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}>;
export type CustomerView = Readonly<{
  id: number;
  nombre: string;
  apellido: string | null;
  nombreCompleto: string;
  telefono: string;
  correo: string | null;
  direccion: string;
}>;
export type CreditApplicationListItemView = Readonly<{
  id: number;
  numero: string;
  estado: CreditApplicationState;
  origen: {
    tipo: 'PEDIDO';
    pedido: {
      id: number;
      numero: string;
      estado: string;
      condicionPago: string;
      estadoPago: string;
      total: string;
      creadoEn: Date;
    };
    visita: {
      id: number;
      inicio: Date;
      fin: Date | null;
      estado: string;
    } | null;
  };
  cliente: CustomerView;
  vendedor: UserView;
  solicitante: UserView;
  politica: { id: number; nombre: string } | null;
  montos: {
    solicitado: string;
    anticipoPropuesto: string;
    autorizado: string | null;
    anticipoRequerido: string | null;
    financiado: string | null;
  };
  plazos: { solicitadoDias: number; autorizadoDias: number | null };
  expediente: {
    requisitos: number;
    requisitosCumplidos: number;
    requisitosPendientes: number;
    requisitosNoCumplidos: number;
    referencias: number;
    referenciasVerificadas: number;
    referenciasPendientes: number;
    referenciasRechazadas: number;
    documentos: number;
    documentosValidados: number;
    documentosPendientes: number;
    documentosRechazados: number;
  };
  decision: {
    id: number;
    tipo: CreditDecisionType;
    decididoPor: UserView;
    observaciones: string | null;
    creadoEn: Date;
  } | null;
  credito: {
    id: number;
    numero: string | null;
    estado: string;
    aprobadoPor: UserView | null;
    aprobadoEn: Date | null;
  } | null;
  integracion: {
    id: number;
    tipo: string;
    estado: CreditIntegrationState;
    actor: UserView;
    intentos: number;
    ultimoError: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
    aplicadaEn: Date | null;
  } | null;
  pagos: {
    cantidad: number;
    montoRegistrado: string;
    montoVerificado: string;
    ultimoPagoEn: Date | null;
  };
  cuentasPorCobrar: {
    cantidad: number;
    montoOriginal: string;
    saldoPendiente: string;
    vencidas: number;
  };
  fechas: {
    solicitadaEn: Date;
    actualizadoEn: Date;
    enRevisionEn: Date | null;
    resueltaEn: Date | null;
    canceladaEn: Date | null;
  };
  ultimaActividad: {
    tipo: CreditEventType;
    actor: UserView | null;
    creadoEn: Date;
  } | null;
  motivo: string | null;
  motivoCancelacion: string | null;
}>;
export type CreditEventView = Readonly<{
  id: number;
  tipo: CreditEventType;
  detalle: string | null;
  actor: UserView | null;
  referencia: { tipo: string; id: number } | null;
  creadoEn: Date;
}>;
export type CreditPage = PageResult<CreditApplicationListItemView>;
export type CreditEventPage = PageResult<CreditEventView>;
export type CreditDetailView = Readonly<
  CreditApplicationListItemView & {
    version: number;
    requisitos: ReadonlyArray<{
      id: number;
      codigo: string;
      nombre: string;
      descripcion: string | null;
      obligatorio: boolean;
      estado: string;
      observaciones: string | null;
      revisadoPor: UserView | null;
      revisadoEn: Date | null;
      creadoEn: Date;
      actualizadoEn: Date;
    }>;
    referencias: ReadonlyArray<{
      id: number;
      tipo: string;
      nombre: string;
      telefono: string;
      relacion: string | null;
      resultado: string;
      observaciones: string | null;
      verificadoPor: UserView | null;
      verificadoEn: Date | null;
      creadoEn: Date;
      actualizadoEn: Date;
    }>;
    documentos: ReadonlyArray<{
      id: number;
      tipo: string;
      url: string;
      key: string | null;
      mimeType: string | null;
      size: number | null;
      estado: string;
      observaciones: string | null;
      revisadoPor: UserView | null;
      revisadoEn: Date | null;
      creadoEn: Date;
      actualizadoEn: Date;
    }>;
    cuentas: ReadonlyArray<{
      id: number;
      numeroDocumento: string | null;
      montoOriginal: string;
      saldoPendiente: string;
      estado: string;
      fechaEmision: Date;
      fechaVencimiento: Date;
      aplicado: string;
    }>;
    pagosDetalle: ReadonlyArray<{
      id: number;
      metodo: string;
      estado: string;
      monto: string;
      referencia: string | null;
      fechaPago: Date;
      verificadoEn: Date | null;
      registradoPor: UserView | null;
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
    ultimosEventos: CreditEventView[];
    acciones: {
      puedeEditar: boolean;
      puedeEnviarRevision: boolean;
      puedeCancelar: boolean;
      puedeAgregarExpediente: boolean;
      puedeRevisarExpediente: boolean;
      puedeAprobar: boolean;
      puedeRechazar: boolean;
      puedeReintentarIntegracion: boolean;
    };
  }
>;
export type CreditSummaryView = Readonly<{
  totalSolicitudes: number;
  porEstado: Record<CreditApplicationState, number>;
  montos: {
    solicitado: string;
    autorizado: string;
    anticipoRequerido: string;
    financiado: string;
    cuentasOriginal: string;
    cuentasPendiente: string;
    pagadoAplicado: string;
  };
  promedios: {
    plazoSolicitadoDias: number | null;
    plazoAutorizadoDias: number | null;
    porcentajeAprobacion: number;
  };
  integraciones: { pendientes: number; aplicadas: number; fallidas: number };
  topSolicitantes: ReadonlyArray<{
    usuario: UserView;
    solicitudes: number;
    montoSolicitado: string;
  }>;
  topClientes: ReadonlyArray<{
    cliente: {
      id: number;
      nombre: string;
      apellido: string | null;
      nombreCompleto: string;
    };
    solicitudes: number;
    montoSolicitado: string;
  }>;
  topPoliticas: ReadonlyArray<{
    politica: { id: number; nombre: string };
    solicitudes: number;
    montoSolicitado: string;
  }>;
}>;
export type CreditPolicyView = Readonly<{
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  montoMaximo: string | null;
  plazoMaximoDias: number | null;
  porcentajeAnticipo: string | null;
  motivoInactivacion: string | null;
  inactivadaEn: Date | null;
  version: number;
  requisitos: ReadonlyArray<{
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    obligatorio: boolean;
    orden: number;
    activo: boolean;
  }>;
  creadoEn: Date;
  actualizadoEn: Date;
}>;
export type CreditPolicyPage = PageResult<CreditPolicyView>;

export type CreditPortfolioFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: 'ACTIVO' | 'CERRADO';
  clienteId?: number;
  vendedorId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  conSaldoPendiente?: boolean;
  empresaId: number;
}>;

export type CreditPortfolioItemView = Readonly<{
  id: number;
  numero: string;
  estado: string;
  solicitud: {
    id: number;
    numero: string;
    estado: CreditApplicationState;
  };
  pedido: {
    id: number;
    numero: string;
    estado: string;
    condicionPago: string;
    total: string;
  };
  cliente: CustomerView;
  vendedor: UserView;
  aprobadoPor: UserView | null;
  montos: {
    autorizado: string;
    anticipoRequerido: string;
    financiado: string;
    cuentaOriginal: string;
    saldoPendiente: string | null;
    pagadoAplicado: string;
  };
  plazoAutorizadoDias: number;
  cuentas: {
    cantidad: number;
    vencidas: number;
    proximoVencimiento: Date | null;
  };
  aprobadoEn: Date | null;
  cerradoEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type CreditPortfolioPage = PageResult<CreditPortfolioItemView>;

export type CreditPortfolioDetailView = Readonly<{
  id: number;
  numero: string;
  estado: string;
  cliente: CustomerView;
  vendedor: UserView;
  aprobadoPor: UserView | null;
  solicitud: {
    id: number;
    numero: string;
    estado: CreditApplicationState;
  };
  pedido: {
    id: number;
    numero: string;
    estado: string;
    condicionPago: string;
    estadoPago: string;
    moneda: string;
    total: string;
  };
  montos: {
    autorizado: string;
    anticipoRequerido: string;
    financiado: string;
    pagadoVerificado: string;
    pagadoAplicado: string;
    anticipoAplicado: string;
    saldoPendiente: string | null;
  };
  anticipo: null | {
    estado: string;
    montoOriginal: string;
    saldoPendiente: string;
    pagoPendienteId: number | null;
  };
  plazoAutorizadoDias: number;
  aprobadoEn: Date | null;
  cerradoEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
  planPago: null | {
    id: number;
    estado: CreditPaymentPlanState;
    frecuencia: CreditPaymentPlanFrequency;
    montoProgramado: string;
    numeroCuotas: number;
    primeraFechaVencimiento: Date;
    activadoEn: Date | null;
    version: number;
    cuotas: ReadonlyArray<{
      id: number;
      numero: number;
      montoProgramado: string;
      fechaVencimiento: Date;
      estado: string;
      cuentaPorCobrarId: number | null;
      montoPagado: string;
      saldoPendiente: string;
    }>;
    eventos: ReadonlyArray<{
      id: number;
      tipo: CreditPaymentPlanEventType;
      estado: CreditPaymentPlanState;
      detalle: string | null;
      actor: UserView | null;
      creadoEn: Date;
    }>;
  };
  cuentasPorCobrar: ReadonlyArray<{
    id: number;
    numeroDocumento: string | null;
    estado: string;
    montoOriginal: string;
    saldoPendiente: string;
    fechaEmision: Date;
    fechaVencimiento: Date;
    cuotaNumero: number | null;
  }>;
  pagos: ReadonlyArray<{
    id: number;
    metodo: string;
    estado: string;
    monto: string;
    montoAplicado: string;
    montoDisponible: string;
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
  acciones: {
    puedeGestionarPlan: boolean;
    puedeActivarPlan: boolean;
  };
}>;
