import {
  BodegaEventType,
  BodegaOperationalDependencies,
  BodegaUserRole,
} from '../../domain/bodega.types';

export type PageMeta = Readonly<{
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

export type PageResult<T> = Readonly<{
  data: T[];
  meta: PageMeta;
}>;

export type BodegaSortField = 'codigo' | 'nombre' | 'creadoEn' | 'actualizadoEn';
export type SortDirection = 'asc' | 'desc';

export type BodegaListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  activo?: boolean;
  esPrincipal?: boolean;
  responsableId?: number;
  sortBy: BodegaSortField;
  sortDir: SortDirection;
}>;

export type BodegaResponsibleView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: BodegaUserRole;
  activo: boolean;
}>;

export type BodegaOperationalSummaryView = BodegaOperationalDependencies &
  Readonly<{
    stockDisponible: number;
    productosConStock: number;
  }>;

export type BodegaListItemView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
  esPrincipal: boolean;
  responsable: BodegaResponsibleView | null;
  operacion: BodegaOperationalSummaryView;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type BodegaEventView = Readonly<{
  id: number;
  tipo: BodegaEventType;
  detalle: string | null;
  metadata: unknown;
  creadoEn: Date;
  actor: BodegaResponsibleView | null;
}>;

export type BodegaDetailView = BodegaListItemView &
  Readonly<{
    motivoInactivacion: string | null;
    inactivadaEn: Date | null;
    puedeDesactivarse: boolean;
    bloqueosDesactivacion: string[];
    ultimosEventos: BodegaEventView[];
  }>;

export type BodegaSelectableView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  esPrincipal: boolean;
}>;

export type BodegaSelectQuery = Readonly<{
  search?: string;
  limit: number;
}>;

export type BodegaEventFilters = Readonly<{
  page: number;
  limit: number;
}>;

export type BodegaOverviewView = Readonly<{
  total: number;
  activas: number;
  inactivas: number;
  principal: BodegaSelectableView | null;
  stockRealTotal: number;
  stockReservadoTotal: number;
  stockDisponibleTotal: number;
}>;

export type CreateBodegaCommand = Readonly<{
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  esPrincipal?: boolean;
  responsableId?: number | null;
  actorId: number;
}>;

export type UpdateBodegaCommand = Readonly<{
  id: number;
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  actorId: number;
}>;

export type AssignBodegaResponsibleCommand = Readonly<{
  id: number;
  responsableId: number | null;
  actorId: number;
}>;

export type DeactivateBodegaCommand = Readonly<{
  id: number;
  motivo: string;
  actorId: number;
}>;

export type ActivateBodegaCommand = Readonly<{
  id: number;
  actorId: number;
}>;

export type SetPrincipalBodegaCommand = Readonly<{
  id: number;
  actorId: number;
}>;


/**
 * Contrato público mínimo para que otros módulos (inventario, despacho, etc.)
 * consuman Bodegas sin depender del repositorio ni de Prisma.
 */
export type BodegaDirectoryEntry = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  esPrincipal: boolean;
}>;
