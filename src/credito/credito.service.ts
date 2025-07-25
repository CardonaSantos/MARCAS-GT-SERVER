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
        cuotasCredito: {
          select: {
            id: true,
            montoEsperado: true,
            montoPagado: true,
            estado: true,
            fechaVencimiento: true,
            fechaPago: true,
          },
          orderBy: {
            fechaVencimiento: 'asc',
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
    try {
      console.log('Los datos entrantes al service son: ', deleteCreditDto);

      // Verificar que el usuario administrador existe
      const admin = await this.prisma.usuario.findUnique({
        where: {
          id: deleteCreditDto.userId,
        },
      });

      // Validar la contraseña del administrador
      const contraseñaValida = await bcrypt.compare(
        deleteCreditDto.adminPassword,
        admin.contrasena,
      );

      if (!contraseñaValida) {
        throw new BadRequestException('Usuario no autenticado');
      }

      // Obtener la venta asociada al crédito
      const creditToDelete = await this.prisma.credito.findUnique({
        where: {
          id: deleteCreditDto.creditoId,
        },
        include: {
          venta: true, // Asegurarnos de que obtenemos la venta asociada al crédito
        },
      });

      if (!creditToDelete || !creditToDelete.venta) {
        throw new BadRequestException(
          'Error al encontrar el registro de crédito o la venta asociada',
        );
      }

      // Obtener el monto pagado de la venta
      const montoPagado = creditToDelete.venta.monto; // En este caso, monto pagado es 150
      console.log(`Monto pagado por la venta: Q${montoPagado}`);

      // Eliminar el crédito
      await this.prisma.credito.delete({
        where: {
          id: deleteCreditDto.creditoId,
        },
      });

      console.log(
        `Crédito con ID ${creditToDelete.id} eliminado correctamente`,
      );

      // Actualizar los saldos de la empresa
      await this.prisma.ingresosEmpresa.update({
        where: {
          id: deleteCreditDto.empresaId,
        },
        data: {
          saldoActual: {
            // Decrementar solo el monto pagado en la venta
            decrement: montoPagado,
          },
          egresosTotales: {
            // Decrementar solo el monto pagado en la venta
            increment: montoPagado,
          },
          numeroVentas: {
            // Decrementar el número de ventas
            decrement: 1,
          },
        },
      });

      console.log('Saldo de la empresa actualizado correctamente');
      return creditToDelete;
    } catch (error) {
      console.log(error);
      throw new BadRequestException(
        'Error al procesar la eliminación del crédito',
      );
    }
  }
}
