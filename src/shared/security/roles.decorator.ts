import { SetMetadata } from '@nestjs/common';

export const APP_ROLES_METADATA = 'app:roles';

export type AppRole =
  | 'ADMIN'
  | 'VENDEDOR'
  | 'BODEGA'
  | 'CONTABILIDAD'
  | 'REPARTIDOR';

export const Roles = (...roles: AppRole[]) =>
  SetMetadata(APP_ROLES_METADATA, roles);
