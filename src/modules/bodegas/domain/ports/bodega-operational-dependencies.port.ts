import { BodegaOperationalDependencies } from '../bodega.types';

export interface BodegaOperationalDependenciesPort {
  inspect(bodegaId: number): Promise<BodegaOperationalDependencies>;
}
