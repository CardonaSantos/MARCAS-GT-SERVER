import { FiscalItemType } from '../../billing.types';

export type BillingProductEntry = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  fiscal: {
    activo: boolean;
    bienOServicio: FiscalItemType;
    unidadMedida: string;
    descripcionFiscal: string | null;
    nombreCortoImpuesto: string | null;
    codigoUnidadGravable: number | null;
  } | null;
}>;

export interface BillingProductDirectoryPort {
  findByIds(ids: readonly number[]): Promise<readonly BillingProductEntry[]>;
}
