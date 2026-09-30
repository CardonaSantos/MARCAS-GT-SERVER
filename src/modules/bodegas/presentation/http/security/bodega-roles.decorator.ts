import { SetMetadata } from '@nestjs/common';
import { BodegaUserRole } from '../../../domain/bodega.types';

export const BODEGA_ROLES_METADATA = 'bodega:roles';

export const BodegaRoles = (...roles: BodegaUserRole[]) =>
  SetMetadata(BODEGA_ROLES_METADATA, roles);

export const BODEGA_READ_ROLES: BodegaUserRole[] = [
  'ADMIN',
  'BODEGA',
  'VENDEDOR',
  'CONTABILIDAD',
  'REPARTIDOR',
];
