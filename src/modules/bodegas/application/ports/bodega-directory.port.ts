import { BodegaDirectoryEntry } from '../models/bodega.models';

export interface BodegaDirectoryPort {
  findById(id: number): Promise<BodegaDirectoryEntry | null>;
  findPrincipal(): Promise<BodegaDirectoryEntry | null>;
}
