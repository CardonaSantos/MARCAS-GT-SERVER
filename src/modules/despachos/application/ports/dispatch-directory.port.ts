import { DispatchState } from '../../dispatch.types';

export type DispatchDirectoryEntry = Readonly<{
  id: number;
  numero: string | null;
  pedidoId: number;
  empresaId: number;
  bodegaId: number;
  estado: DispatchState;
  programadoEn: Date | null;
  preparadoEn: Date | null;
  despachadoEn: Date | null;
  detalles: ReadonlyArray<{
    id: number;
    pedidoDetalleId: number;
    productoId: number;
    cantidadProgramada: number;
    cantidadPreparada: number;
    cantidadDespachada: number;
  }>;
}>;

export interface DispatchDirectoryPort {
  findById(id: number): Promise<DispatchDirectoryEntry | null>;
}
