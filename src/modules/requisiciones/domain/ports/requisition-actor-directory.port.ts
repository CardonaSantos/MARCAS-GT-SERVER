import { AppRole } from 'src/shared/security/roles.decorator';

export type RequisitionActorEntry = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;

export interface RequisitionActorDirectoryPort {
  findById(id: number): Promise<RequisitionActorEntry | null>;
}
