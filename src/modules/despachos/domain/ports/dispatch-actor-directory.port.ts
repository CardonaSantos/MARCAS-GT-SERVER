import { DispatchActorEntry } from '../../dispatch.types';

export interface DispatchActorDirectoryPort {
  findById(id: number): Promise<DispatchActorEntry | null>;
}
