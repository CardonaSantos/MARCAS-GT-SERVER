import { BodegaUserSnapshot } from '../bodega.types';

export interface BodegaUserDirectoryPort {
  findById(userId: number): Promise<BodegaUserSnapshot | null>;
}
