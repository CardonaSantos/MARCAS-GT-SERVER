import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { UpdateCreditoDto } from './dto/update-credito.dto';
import { PrismaService } from 'src/prisma.service';
import { createPaymentDto } from './dto/createPaymentDto.dto';
import { deleteCreditDto } from './dto/delete-credit.dto';
import * as bcrypt from 'bcrypt';
import { DeletePaymentDto } from './dto/delete-payment-cuota.dto';

@Injectable()
export class CreditoService {
  constructor(private readonly prisma: PrismaService) {}

  async getCredits() {
    return this.prisma.credito.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            direccion: true,
          },
        },
        venta: {
          select: {
            id: true,
            monto: true,
            montoConDescuento: true,
            descuento: true,
            metodoPago: true,
            timestamp: true,
            vendedor: {
              select: {
                id: true,
                nombre: true,
                correo: true,
              },
            },
          },
        },
      },
    });
  }

  async getOnePaymentToPDF(paymentID: number) {
    try {
      const pagoConCredito = await this.prisma.pagoCredito.findUnique({
        where: {
          id: paymentID,
        },
        include: {
          credito: {
            include: {
              cliente: {
                select: {
                  id: true,
                  nombre: true,
                  apellido: true,
                  direccion: true,
                  telefono: true,
                },
              },
              empresa: {
                select: {
                  id: true,
                  nombre: true,
                  direccion: true,
                  telefono: true,
                  pbx: true,
                  email: true,
                  website: true,
                },
              },
            },
          },
        },
      });

      if (!pagoConCredito) {
        throw new BadRequestException('El pago no existe.');
      }

      return pagoConCredito;
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Error al conseguir datos');
    }
  }

  async createPaymetCredit(createPayment: createPaymentDto) {
    const { creditoId, cuotaId, monto, empresaId, metodoPago, ventaId } =
      createPayment;

    // 1. Validar cuota
    const cuota = await this.prisma.cuotaCredito.findUnique({
      where: { id: cuotaId },
    });

    if (!cuota) {
      throw new Error(`La cuota con ID ${cuotaId} no existe.`);
    }

    if (cuota.estado === 'PAGADA') {
      throw new Error(`La cuota ya fue pagada.`);
    }

    // 2. Registrar pago en la cuota
    const montoPagadoTotal = cuota.montoPagado + monto;
    const estadoActualizado =
      montoPagadoTotal >= (cuota.montoEsperado || 0) ? 'PAGADA' : 'PENDIENTE';

    await this.prisma.cuotaCredito.update({
      where: { id: cuotaId },
      data: {
        montoPagado: montoPagadoTotal,
        estado: estadoActualizado,
        fechaPago: new Date(),
      },
    });

    // 3. (Opcional) Registrar el historial del pago
    const pago = await this.prisma.pagoCredito.create({
      data: {
        metodoPago,
        monto: monto,
        creditoId: creditoId,
      },
    });

    // 4. Actualizar el crédito
    const credito = await this.prisma.credito.findUnique({
      where: { id: creditoId },
    });
    if (!credito) throw new Error('Crédito no encontrado');

    const nuevoSaldoPendiente = credito.saldoPendiente - monto;

    const creditoActualizado = await this.prisma.credito.update({
      where: { id: creditoId },
      data: {
        totalPagado: {
          increment: monto,
        },
        saldoPendiente: nuevoSaldoPendiente < 0 ? 0 : nuevoSaldoPendiente,
      },
    });

    // 5. Actualizar la venta
    await this.prisma.venta.update({
      where: { id: ventaId },
      data: {
        monto: {
          increment: monto,
        },
      },
    });

    // 6. Actualizar ingresos de la empresa
    await this.prisma.ingresosEmpresa.update({
      where: { id: empresaId },
      data: {
        ingresosTotales: { increment: monto },
        saldoActual: { increment: monto },
      },
    });

    return {
      mensaje: 'Pago registrado correctamente',
      cuotaActualizada: {
        id: cuotaId,
        montoPagado: montoPagadoTotal,
        estado: estadoActualizado,
      },
      creditoActualizado,
      pago,
    };
  }

  //TERMINAR DE HACER LOS AJUSTES, PARA QUE EL PAGO ELIMINADO CUADRE CON EL CREDITO, Y LOS INGRESOS DE LA EMPRESA
  // credito.service.ts
  async deletePayment(dto: DeletePaymentDto) {
    const { userId, password, empresaId, creditoId, cuotaId } = dto;

    // 1. Validar administrador
    const admin = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!admin) throw new BadRequestException('Usuario no encontrado');
    const ok = await bcrypt.compare(password, admin.contrasena);
    if (!ok) throw new BadRequestException('Sin permiso para eliminar pago');

    // 2. Leer la cuota y asegurarnos de que haya un pago
    const cuota = await this.prisma.cuotaCredito.findUnique({
      where: { id: cuotaId },
    });
    if (!cuota) throw new BadRequestException('Cuota no encontrada');
    if (cuota.montoPagado <= 0) {
      throw new BadRequestException('Esta cuota no tiene pagos registrados');
    }
    const monto = cuota.montoPagado;

    try {
      // 3. Todo dentro de la transacción
      const creditoActualizado = await this.prisma.$transaction(async (tx) => {
        // 3.1 Revertir la cuota
        await tx.cuotaCredito.update({
          where: { id: cuotaId },
          data: {
            montoPagado: 0,
            estado: 'PENDIENTE',
            fechaPago: null,
          },
        });

        // 3.2 Actualizar el crédito: decrementamos totalPagado (solo si totalPagado >= monto),
        //     incrementamos saldoPendiente
        const creditoUpd = await tx.credito.update({
          where: {
            id: creditoId,
            totalPagado: { gte: monto },
          },
          data: {
            totalPagado: { decrement: monto },
            saldoPendiente: { increment: monto },
          },
        });

        // 3.3 Eliminar el pago histórico más reciente
        const pagoHist = await tx.pagoCredito.findFirst({
          where: { creditoId, monto },
          orderBy: { timestamp: 'desc' },
        });
        if (pagoHist) {
          await tx.pagoCredito.delete({ where: { id: pagoHist.id } });
        }

        // 3.4 Actualizar ingresos de la empresa: solo si saldoActual >= monto
        await tx.ingresosEmpresa.update({
          where: {
            id: empresaId,
            saldoActual: { gte: monto },
          },
          data: {
            saldoActual: { decrement: monto },
            egresosTotales: { increment: monto },
          },
        });

        return creditoUpd;
      });

      return {
        message: 'Pago eliminado y cuota revertida correctamente',
        cuotaId,
        creditoActualizado,
      };
    } catch (err: any) {
      // Prisma lanza P2025 si no encuentra registros que cumplan el where (e.g., fondos insuficientes)
      if (err.code === 'P2025') {
        throw new BadRequestException(
          'Fondos insuficientes para revertir esta operación',
        );
      }
      // Re-lanzar cualquier otro error
      throw err;
    }
  }

  async deleteMany() {
    return this.prisma.credito.deleteMany({});
  }

  async deleteCreditRegist(deleteCreditDto: deleteCreditDto) {
    return this.prisma.$transaction(async (prisma) => {
      // 1) Autenticación
      const admin = await prisma.usuario.findUnique({
        where: { id: deleteCreditDto.userId },
      });
      if (!admin) throw new BadRequestException('Usuario no encontrado');

      const ok = await bcrypt.compare(
        deleteCreditDto.adminPassword,
        admin.contrasena,
      );
      if (!ok) throw new BadRequestException('Usuario no autenticado');

      // 2) Cargar crédito con ventaId
      const credito = await prisma.credito.findUnique({
        where: { id: deleteCreditDto.creditoId },
        include: { venta: true },
      });
      if (!credito) throw new BadRequestException('Crédito no encontrado');

      // 3) Calcular total pagado (lo que sí impactó ingresos)
      const agg = await prisma.pagoCredito.aggregate({
        where: { creditoId: deleteCreditDto.creditoId },
        _sum: { monto: true },
      });
      const totalPagos = agg._sum.monto ?? 0;

      // 4) Revertir contabilidad de la empresa (solo lo cobrado)
      if (totalPagos > 0) {
        await prisma.ingresosEmpresa.update({
          where: { id: deleteCreditDto.empresaId },
          data: {
            ingresosTotales: { decrement: totalPagos },
            saldoActual: { decrement: totalPagos },
          },
        });
      }

      // 5) Borrar la venta (esto CASCADE borra el crédito)
      if (credito.ventaId) {
        await prisma.venta.delete({ where: { id: credito.ventaId } });
      } else {
        // fallback por si no hay venta enlazada
        await prisma.credito.delete({
          where: { id: deleteCreditDto.creditoId },
        });
      }

      // 6) Ajustar número de ventas
      await prisma.ingresosEmpresa.update({
        where: { id: deleteCreditDto.empresaId },
        data: { numeroVentas: { decrement: 1 } },
      });

      return {
        message: 'Crédito y venta eliminados',
        creditoId: deleteCreditDto.creditoId,
      };
    });
  }
}
