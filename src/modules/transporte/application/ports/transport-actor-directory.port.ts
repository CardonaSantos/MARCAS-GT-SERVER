import { TransportActor } from '../../transport.types';
export interface TransportActorDirectoryPort {
  findById(id: number): Promise<TransportActor | null>;
}
