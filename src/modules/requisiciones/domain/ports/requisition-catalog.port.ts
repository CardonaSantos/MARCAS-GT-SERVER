export type RequisitionProductEntry = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type RequisitionProviderEntry = Readonly<{
  id: number;
  nombre: string;
  activo: boolean;
}>;

export interface RequisitionCatalogPort {
  findProduct(id: number): Promise<RequisitionProductEntry | null>;
  findProvider(id: number): Promise<RequisitionProviderEntry | null>;
}
