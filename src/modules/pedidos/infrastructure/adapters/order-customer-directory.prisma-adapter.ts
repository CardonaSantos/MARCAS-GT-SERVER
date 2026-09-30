import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { OrderCustomerDirectoryPort } from '../../domain/ports/order-customer-directory.port';

@Injectable()
export class OrderCustomerDirectoryPrismaAdapter implements OrderCustomerDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        telefono: true,
        correo: true,
        direccion: true,
      },
    });
  }
}
