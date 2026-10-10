import { DriverState, VehicleState } from '../../transport.types';
export interface TransportCatalogRepositoryPort {
  findVehicle(
    id: number,
  ): Promise<{
    id: number;
    empresaId: number;
    estado: VehicleState;
    activo: boolean;
    version: number;
  } | null>;
  findDriver(
    id: number,
  ): Promise<{
    id: number;
    empresaId: number;
    estado: DriverState;
    activo: boolean;
    version: number;
  } | null>;
  findCarrier(
    id: number,
  ): Promise<{
    id: number;
    empresaId: number;
    tipo: 'INTERNO' | 'EXTERNO';
    activo: boolean;
    version: number;
  } | null>;
  createCarrier(input: any): Promise<{ id: number }>;
  createVehicle(input: any): Promise<{ id: number }>;
  createDriver(input: any): Promise<{ id: number }>;
  deactivateCarrier(id: number, reason: string): Promise<void>;
  deactivateVehicle(id: number, reason: string): Promise<void>;
  deactivateDriver(id: number, reason: string): Promise<void>;
}
