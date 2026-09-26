import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { InventoryUserRole } from '../../domain/inventory.types';
import { InventoryUserDirectoryPort } from '../../domain/ports/inventory-user-directory.port';

@Injectable()
export class InventoryUserDirectoryPrismaAdapter
  implements InventoryUserDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        activo: true,
      },
    });

    return user ? { ...user, rol: user.rol as InventoryUserRole } : null;
  }
}
