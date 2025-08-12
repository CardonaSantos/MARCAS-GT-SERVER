import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateSaleDto, ProductSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { PrismaService } from 'src/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import * as bcrypt from 'bcrypt';
import { CreditoService } from 'src/credito/credito.service';
import { Venta } from '@prisma/client';
//
import { PrismaClient, Prisma } from '@prisma/client';

import * as dayjs from 'dayjs';
import 'dayjs/locale/es';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.locale('es');

// type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>;
type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
@Injectable()
export class SaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationsService,
    // private readonly creditoService: CreditoService,
  ) {}

  // createSale.ts
  async createSale(createSaleDto: CreateSaleDto) {
    return await this.prisma
      .$transaction(async (prisma) => {
        if (!createSaleDto.empresaId) {
          throw new Error('El ID de empresa es requerido');
        }

        await this.handleStockValidation(prisma, createSaleDto.productos);

        const newSale = await this.createSaleRecord(prisma, createSaleDto);

        if (createSaleDto.metodoPago === 'CREDITO') {
          if (!createSaleDto.clienteId) {
            throw new Error('El cliente es obligatorio para ventas a crédito');
          }
          await this.handleCreditSale(prisma, createSaleDto, newSale);
        }

        // ❗ Para crédito NO incrementes ingresos aquí.
        const ingresoIncrement =
          createSaleDto.metodoPago === 'CREDITO'
            ? 0
            : newSale.montoConDescuento;

        await this.updateCompanyIncome(
          prisma,
          createSaleDto.empresaId,
          ingresoIncrement,
        );

        await this.createSaleNotification(newSale, createSaleDto);

        return newSale;
      })
      .catch((error) => {
        console.error('Error en transacción:', error);
        throw new Error(`Error al crear la venta: ${error.message}`);
      });
  }

  //CREAR VENTA CON VINCULACION DE VISITA

  async createSaleWithVisit(createSaleDto: CreateSaleDto) {
    return await this.prisma
      .$transaction(async (prisma) => {
        // 1) Validación básica
        if (!createSaleDto.empresaId) {
          throw new Error('El ID de empresa es requerido');
        }

        // 2) Validar/actualizar stock
        await this.handleStockValidation(prisma, createSaleDto.productos);

        // 3) Crear venta
        const newSale = await this.createSaleRecord(prisma, createSaleDto);

        // 4) Si es crédito, crear el crédito simple (sin sumar ingresos)
        const isCredit = createSaleDto.metodoPago === 'CREDITO';
        if (isCredit) {
          if (!createSaleDto.clienteId) {
            throw new Error('El cliente es obligatorio para ventas a crédito');
          }
          await this.handleCreditSale(prisma, createSaleDto, newSale); // <- void
        }

        // 5) Actualizar ingresos (para crédito = 0)
        const ingresoIncrement = isCredit ? 0 : newSale.montoConDescuento;
        await this.updateCompanyIncome(
          prisma,
          createSaleDto.empresaId,
          ingresoIncrement,
        );

        // 6) Vincular venta a la visita (si aplica)
        if (createSaleDto.registroVisitaId) {
          await prisma.visita.update({
            where: { id: createSaleDto.registroVisitaId },
            data: { ventas: { connect: { id: newSale.id } } },
          });
        }

        // 7) Notificación
        await this.createSaleNotification(newSale, createSaleDto);

        return newSale;
      })
      .catch((error) => {
        console.error('Error en transacción:', error);
        throw new Error(`Error al crear la venta: ${error.message}`);
      });
  }

  // Métodos auxiliares
  private async handleStockValidation(
    prisma: PrismaTransaction,
    productos: ProductSaleDto[],
  ) {
    await Promise.all(
      productos.map(async (prod) => {
        const updatedStock = await prisma.stock.updateMany({
          where: {
            productoId: prod.productoId,
            cantidad: { gte: prod.cantidad },
          },
          data: { cantidad: { decrement: prod.cantidad } },
        });

        if (updatedStock.count === 0) {
          throw new Error(
            `Stock insuficiente para el producto: ${prod.productoId}`,
          );
        }
      }),
    );
  }

  private async createSaleRecord(
    prisma: PrismaTransaction,
    dto: CreateSaleDto,
  ) {
    return prisma.venta.create({
      data: {
        clienteId: dto.clienteId,
        usuarioId: dto.vendedorId,
        descuento: dto.descuento,
        metodoPago: dto.metodoPago,
        monto: dto.monto,
        montoConDescuento: dto.montoConDescuento,
        productos: {
          create: dto.productos.map((prod) => ({
            producto: { connect: { id: prod.productoId } },
            cantidad: prod.cantidad,
            precio: prod.precio,
          })),
        },
      },
      include: { productos: { include: { producto: true } } },
    });
  }

  private async handleCreditSale(
    prisma: PrismaTransaction,
    dto: CreateSaleDto,
    sale: Venta,
  ): Promise<void> {
    const fechaInicio = sale.timestamp ?? new Date();
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + 1);

    await prisma.credito.create({
      data: {
        venta: { connect: { id: sale.id } },
        cliente: { connect: { id: dto.clienteId } },
        empresa: { connect: { id: dto.empresaId } },

        montoTotal: sale.montoConDescuento,
        totalPagado: 0,
        saldoPendiente: sale.montoConDescuento,
        montoTotalConInteres: sale.montoConDescuento,

        comentario: dto.comentario ?? null,
        estado: 'ACTIVO',
        fechaFin: fechaVencimiento,
      },
    });
  }

  private async updateCompanyIncome(
    prisma: PrismaTransaction,
    empresaId: number,
    amount: number,
  ) {
    if (amount <= 0) return;
    console.log(`Actualizando ingresos de empresa ${empresaId} con ${amount}`);
    await prisma.ingresosEmpresa.update({
      where: { id: empresaId },
      data: {
        ingresosTotales: { increment: amount },
        saldoActual: { increment: amount },
        numeroVentas: { increment: 1 },
      },
    });
  }

  private async createSaleNotification(sale: Venta, dto: CreateSaleDto) {
    const [cliente, vendedor] = await Promise.all([
      this.prisma.cliente.findUnique({ where: { id: dto.clienteId } }),
      this.prisma.usuario.findUnique({ where: { id: dto.vendedorId } }),
    ]);

    if (!cliente || !vendedor) return;

    const formattedAmount = new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ',
    }).format(sale.montoConDescuento);

    if (dto.visita || dto.registroVisitaId) {
      try {
        await this.notificationService.createNotification({
          mensaje: `${vendedor.nombre} ha registrado una venta durante una visita, de ${formattedAmount} para ${cliente.nombre}.`,
          remitenteId: vendedor.id,
        });
        console.log(
          '✅ Notificación de venta en visita enviada correctamente.',
        );
        return; // Evita que se genere la segunda notificación
      } catch (error) {
        console.error('❌ Error al crear notificación de visita:', error);
        return; // Evita la segunda notificación en caso de error
      }
    }

    // Solo se ejecuta si la venta NO fue en una visita
    try {
      await this.notificationService.createNotification({
        mensaje: `${vendedor.nombre} ha registrado una venta de ${formattedAmount} para ${cliente.nombre}.`,
        remitenteId: vendedor.id,
      });
      console.log('✅ Notificación de venta general enviada correctamente.');
    } catch (error) {
      console.error('❌ Error al crear notificación de venta:', error);
    }
  }

  async createSaleForRegist(createSaleDto: CreateSaleDto) {
    try {
      return await this.prisma.$transaction(async (prisma) => {
        if (!createSaleDto.empresaId) {
          throw new Error('El ID de empresa es requerido');
        }

        // 1) Validar y descontar stock (tu helper ya lo hace con updateMany)
        await this.handleStockValidation(prisma, createSaleDto.productos);

        // 2) Crear venta (tu helper ya incluye productos)
        const newSale = await this.createSaleRecord(prisma, createSaleDto);
        if (!newSale?.id) throw new Error('La venta no se creó correctamente.');

        // 3) Crédito simple (NO sumar ingresos aquí)
        const isCredit = createSaleDto.metodoPago === 'CREDITO';
        if (isCredit) {
          if (!createSaleDto.clienteId) {
            throw new Error('El cliente es obligatorio para ventas a crédito');
          }
          await this.handleCreditSale(prisma, createSaleDto, newSale); // void
        }

        // 4) Actualizar ingresos de empresa
        //    Para crédito = 0. Asegúrate de que updateCompanyIncome incremente numeroVentas siempre.
        const ingresoIncrement = isCredit ? 0 : newSale.montoConDescuento;
        await this.updateCompanyIncome(
          prisma,
          createSaleDto.empresaId,
          ingresoIncrement,
        );

        // 5) Vincular a la visita abierta (si aplica)
        if (createSaleDto.registroVisitaId) {
          await prisma.visita.update({
            where: { id: createSaleDto.registroVisitaId },
            data: { ventas: { connect: { id: newSale.id } } },
          });
        }

        // 6) Notificación
        await this.createSaleNotification(newSale, createSaleDto);

        return newSale;
      });
    } catch (error: any) {
      console.error(error);
      throw new Error('Error al crear la venta: ' + error.message);
    }
  }

  async findAll() {
    try {
      const saleRegist = await this.prisma.venta.findMany({
        include: {
          cliente: true,
          productos: { include: { producto: true } },
          vendedor: true,
          Credito: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
      console.log('servicio de venta recuperacion');

      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async findOne(id: number) {
    try {
      const saleRegist = await this.prisma.venta.findUnique({
        where: { id },
      });
      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async findSimpleSales() {
    // try {
    //   const sales = await this.prisma.venta.findMany({
    //     where: {
    //       prospectoId: null, // Asegúrate de que sea prospectoId si estás usando el campo específico
    //     },
    //     include: {
    //       cliente: {
    //         select: {
    //           nombre: true,
    //         },
    //       },
    //     },
    //   });

    //   console.log(sales); // Añade un log para ver qué se está devolviendo
    //   return sales;
    // } catch (error) {
    //   console.log(error);
    //   throw new InternalServerErrorException(
    //     'No se encontraron ventas disponibles',
    //   );
    // }
    console.log('Servicio sales buscando sales simples ');
  }

  async findMySalesUser(idUSer: number) {
    try {
      const saleRegist = await this.prisma.venta.findMany({
        where: {
          usuarioId: idUSer,
        },
        include: {
          cliente: true,
          productos: { include: { producto: true } },
          vendedor: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
      console.log('servicio de venta recuperacion');

      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async findCustomerSales(customerId: number) {
    try {
      const saleRegist = await this.prisma.venta.findMany({
        where: {
          clienteId: customerId,
        },
        include: {
          cliente: true,
          productos: { include: { producto: true } },
          vendedor: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
      console.log('servicio de venta recuperacion');

      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async remove(id: number) {
    try {
      const saleRegist = await this.prisma.venta.delete({
        where: { id },
      });
      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async removeAllRegist2() {
    try {
      const saleRegist = await this.prisma.venta.deleteMany({});
      return saleRegist;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  //OBTENER ULTIMAS 5
  async findLastFiveSales() {
    try {
      const lastFiveSales = await this.prisma.venta.findMany({
        orderBy: {
          id: 'desc', // Ordenar por el ID en orden descendente para obtener las últimas ventas
        },
        take: 5, // Limitar a las últimas 5 ventas
        include: {
          cliente: {
            select: {
              nombre: true, // Solo seleccionamos el nombre del cliente
              correo: true, // El correo para mostrar algo superficial
              telefono: true, // Otras posibles opciones que puedes mostrar
            },
          },
          vendedor: {
            select: {
              nombre: true, // Solo el nombre del vendedor
              correo: true, // Correo del vendedor
            },
          },
          productos: {
            select: {
              id: true,
              cantidad: true,
            },
          },
        },
      });

      return lastFiveSales;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('No se encontraron registros de ventas');
    }
  }

  async getSaleToPDF(id: number) {
    try {
      const sale = await this.prisma.venta.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          timestamp: true,
          monto: true,
          montoConDescuento: true,
          descuento: true,
          metodoPago: true,
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              correo: true,
              direccion: true,
            },
          },
          vendedor: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
          productos: {
            select: {
              cantidad: true,
              precio: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  descripcion: true,
                  codigoProducto: true,
                },
              },
            },
          },
        },
      });

      // Validación por si no se encuentra la venta
      if (!sale) {
        throw new BadRequestException(`La venta con ID ${id} no existe`);
      }

      return sale;

      // Agregar los totales calculados al resultado
    } catch (error) {
      console.error(`Error al generar el PDF de la venta ${id}:`, error);
      throw new BadRequestException('Error al conseguir la venta para el PDF');
    }
  }

  async removeSale(
    saleId: number,
    userId: number,
    adminPassword: string,
    sucursalId: number,
  ): Promise<boolean> {
    console.log(`Iniciando proceso de eliminación de venta con ID: ${saleId}`);

    // Buscar al usuario
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.log(`Usuario con ID ${userId} no encontrado.`);
      throw new NotFoundException('Usuario no encontrado.');
    }

    // Validar contraseña
    const isPasswordValid = await bcrypt.compare(
      adminPassword,
      user.contrasena,
    );
    if (!isPasswordValid) {
      console.log(`Contraseña inválida para el usuario con ID ${userId}`);
      throw new UnauthorizedException('Contraseña inválida.');
    }

    // Obtener venta con sus créditos asociados
    const sale = await this.prisma.venta.findUnique({
      where: { id: saleId },
      include: {
        Credito: true, // Incluir créditos vinculados
      },
    });

    if (!sale) {
      console.log(`Venta con ID ${saleId} no encontrada.`);
      throw new NotFoundException('Venta no encontrada.');
    }

    console.log(`Venta encontrada: `, sale);

    let totalPagado = 0;
    let montoCreditoPendiente = 0;

    // Calcular pagos de cada crédito asociado
    if (sale.Credito) {
      console.log(`Venta con ID ${saleId} tiene créditos asociados.`);
      for (const credito of sale.Credito) {
        console.log(`Consultando pagos para crédito con ID ${credito.id}`);
        const pagos = await this.prisma.pagoCredito.findMany({
          where: { creditoId: credito.id },
        });

        // Sumar los pagos realizados para este crédito
        const pagosTotales = pagos.reduce((sum, pago) => sum + pago.monto, 0);
        console.log(
          `Pagos encontrados para crédito ${credito.id}:`,
          pagos,
          `Total pagado: ${pagosTotales}`,
        );
        totalPagado += pagosTotales;

        // Calcular el saldo pendiente del crédito
        montoCreditoPendiente += credito.montoTotalConInteres - pagosTotales;
      }
    } else {
      console.log(`Venta con ID ${saleId} no tiene créditos asociados.`);
    }

    // Eliminar la venta (esto eliminará créditos y pagos por cascade)
    console.log(`Eliminando la venta con ID ${saleId}...`);
    await this.prisma.venta.delete({
      where: { id: saleId },
    });

    // Actualizar saldos de la empresa
    console.log(
      `Actualizando saldos de la empresa en sucursal con ID ${sucursalId}...`,
    );
    await this.prisma.ingresosEmpresa.update({
      where: { id: sucursalId },
      data: {
        saldoActual: {
          decrement: sale.montoConDescuento, // Solo descontar el monto de la venta
        },
        numeroVentas: {
          decrement: 1,
        },
        egresosTotales: {
          increment: montoCreditoPendiente, // Solo incrementar el saldo pendiente del crédito
        },
      },
    });

    console.log(`Proceso completado con éxito para la venta con ID ${saleId}`);
    return true;
  }
}
