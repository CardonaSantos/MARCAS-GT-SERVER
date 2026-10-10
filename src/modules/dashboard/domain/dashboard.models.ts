/** Contratos de lectura. Importes expresados como strings decimales GTQ. */
export type AdminDashboardView =
  | 'resumen' | 'alertas' | 'agenda' | 'graficos' | 'actividad' | 'live';

export const ADMIN_DASHBOARD_SECTIONS = {
  resumen: ['finanzas', 'pedidos', 'cartera', 'inventario', 'logistica', 'abastecimiento', 'clientes', 'facturacion'],
  alertas: ['pagosPorVerificar', 'creditosPorAprobar', 'cuotasVencidas', 'despachosFallidos', 'incidenciasTransporte', 'requisicionesPorAprobar'],
  agenda: ['proximosCobros', 'pedidosPendientes', 'salidasProgramadas', 'transferenciasPorRecibir'],
  graficos: ['cobrosDiarios', 'pedidosDiarios', 'carteraAntiguedad', 'despachosPorEstado'],
  actividad: ['ultimosPedidos', 'ultimosPagos', 'ultimosEnvios'],
  live: ['enviosEnRuta', 'personalEnCampo'],
} as const satisfies Record<AdminDashboardView, readonly string[]>;

export type AdminDashboardSection = (typeof ADMIN_DASHBOARD_SECTIONS)[AdminDashboardView][number];
export type DashboardSectionResult =
  | { status: 'OK'; data: unknown }
  | { status: 'UNAVAILABLE'; data: null };

export interface DashboardScope {
  empresaId: number;
  now: Date;
  desde: Date;
  hasta: Date; // exclusive
  limit: number;
}

export interface DashboardFilters {
  desde?: string;
  hasta?: string;
  limit?: number;
}
