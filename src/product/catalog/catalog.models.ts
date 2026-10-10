import { PageResult } from 'src/shared/application/pagination/page.models';

export type CatalogWarehouseStock = Readonly<{
  stockId: number;
  bodega: {
    id: number;
    codigo: string;
    nombre: string;
    esPrincipal: boolean;
    activo: boolean;
  };
  real: number;
  reservado: number;
  disponible: number;
  costoPromedio: string;
  actualizadoEn: Date;
}>;

export type CatalogProductView = Readonly<{
  id: number;
  nombre: string;
  codigoProducto: string;
  descripcion: string | null;
  precio: number;
  /** Costo del catálogo, NO el costo promedio del inventario. */
  costoReferencia: number | null;
  categorias: Array<{ id: number; nombre: string }>;
  imagenes: Array<{ id: number; url: string }>;
  imagenPrincipal: string | null;
  perfilFiscal: {
    bienOServicio: 'BIEN' | 'SERVICIO';
    unidadMedida: string;
    descripcionFiscal: string | null;
    activo: boolean;
  } | null;
  inventario: {
    fuente: 'STOCK_BODEGA';
    totales: { real: number; reservado: number; disponible: number };
    bodegas: CatalogWarehouseStock[];
  };
  /** Saldo de la tabla anterior, solo para diagnóstico. Nunca sumar al stock nuevo. */
  stockLegacy: {
    fuente: 'STOCK_LEGACY';
    cantidad: number;
    proveedorId: number | null;
    diferenciaConInventarioReal: number;
  } | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type ProductCatalogPage = PageResult<CatalogProductView>;

export type CatalogMovementSummary = Readonly<{
  id: number;
  tipo: string;
  cantidad: number;
  creadoEn: Date;
  costoUnitario: string | null;
  bodega: { id: number; nombre: string; codigo: string };
  proveedor: { id: number; nombre: string } | null;
  referencia: { tipo: string; id: number } | null;
}>;

export type ProductCatalogDetail = CatalogProductView & {
  /**
   * Movimientos entrantes más recientes, no trazabilidad por lote.
   * El proveedor del movimiento NO asegura la procedencia de cada unidad remanente.
   */
  ingresosRecientes: CatalogMovementSummary[];
  movimientosRecientes: CatalogMovementSummary[];
};
