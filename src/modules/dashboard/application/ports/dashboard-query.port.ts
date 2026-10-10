import { AdminDashboardSection, DashboardScope } from '../../domain/dashboard.models';

export const DASHBOARD_QUERY = Symbol('DASHBOARD_QUERY');

/** Solo lecturas: cada sección consulta un dominio sin mutar transacciones. */
export interface DashboardQueryPort {
  getEmpresaId(actorId: number): Promise<number>;
  read(section: AdminDashboardSection, scope: DashboardScope): Promise<unknown>;
}
