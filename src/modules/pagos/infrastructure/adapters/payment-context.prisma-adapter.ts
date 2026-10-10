import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PaymentContextPort } from '../../application/ports/payment-context.port';

@Injectable()
export class PaymentContextPrismaAdapter implements PaymentContextPort {
  constructor(private readonly prisma: PrismaService) {}

  async customerExists(clienteId: number): Promise<boolean> {
    const row = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });

    return Boolean(row);
  }

  async findOrder(pedidoId: number) {
    const row = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        empresaId: true,
        clienteId: true,
        vendedorId: true,
        estado: true,
        condicionPago: true,
        estadoPago: true,
        moneda: true,
        total: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...row,
      estado: String(row.estado),
      condicionPago: String(row.condicionPago),
      estadoPago: String(row.estadoPago),
      total: row.total.toFixed(2),
    };
  }

  async findBank(bancoId: number) {
    return this.prisma.banco.findUnique({
      where: { id: bancoId },
      select: {
        id: true,
        empresaId: true,
        nombre: true,
        activo: true,
      },
    });
  }
}
