export type OrderProductEntry = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  precio: string;
}>;

export interface OrderProductCatalogPort {
  findByIds(ids: number[]): Promise<OrderProductEntry[]>;
}
