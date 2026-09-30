import { SetMetadata } from '@nestjs/common';
import { InventoryUserRole } from '../../../domain/inventory.types';

export const INVENTORY_ROLES_METADATA = 'inventory:roles';

export const InventoryRoles = (...roles: InventoryUserRole[]) =>
  SetMetadata(INVENTORY_ROLES_METADATA, roles);

export const INVENTORY_MANAGEMENT_ROLES: InventoryUserRole[] = [
  'ADMIN',
  'BODEGA',
];

export const INVENTORY_FULL_READ_ROLES: InventoryUserRole[] = [
  'ADMIN',
  'BODEGA',
  'CONTABILIDAD',
];

export const INVENTORY_AVAILABILITY_ROLES: InventoryUserRole[] = [
  'ADMIN',
  'BODEGA',
  'CONTABILIDAD',
  'VENDEDOR',
];
