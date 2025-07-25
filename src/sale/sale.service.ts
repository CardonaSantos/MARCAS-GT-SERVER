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

  async createSale(createSaleDto: CreateSaleDto) {
    console.log('Datos recibidos:', JSON.stringify(createSaleDto));
    console.log('LA DATA RECIBIDA ES:::::::::::');
    console.log(createSaleDto);

    return await this.prisma
      .$transaction(async (prisma) => {
        if (!createSaleDto.empresaId) {
          throw new Error('El ID de empresa es requerido');
        }

        await this.handleStockValidation(prisma, createSaleDto.productos);

        const newSale = await this.createSaleRecord(prisma, createSaleDto);

        const ingresoIncrement =
          createSaleDto.metodoPago === 'CREDITO'
            ? await this.handleCreditSale(prisma, createSaleDto, newSale)
            : newSale.montoConDescuento;

        console.log('Ingreso Incrementado:', ingresoIncrement);

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
    console.log('Datos recibidos:', JSON.stringify(createSaleDto));
    console.log('LA DATA RECIBIDA ES:::::::::::');
    console.log(createSaleDto);

    return await this.prisma
      .$transaction(async (prisma) => {
        // 1. Validación inicial
        if (!createSaleDto.empresaId) {
          throw new Error('El ID de empresa es requerido');
        }

        // 2. Verificar stock y actualizar en una sola operación
        await this.handleStockValidation(prisma, createSaleDto.productos);

        // 3. Crear la venta
        const newSale = await this.createSaleRecord(prisma, createSaleDto);

        let ingresoIncrement = 0;
        if (createSaleDto.metodoPago === 'CREDITO') {
          ingresoIncrement = await this.handleCreditSale(
            prisma,
            createSaleDto,
            newSale,
          );
        } else {
          ingresoIncrement = newSale.montoConDescuento;
        }

        console.log('Ingreso Incrementado:', ingresoIncrement);

        // 4. Actualizar ingresos de la empresa
        await this.updateCompanyIncome(
          prisma,
          createSaleDto.empresaId,
          ingresoIncrement,
        );

        // 5. Vincular la venta con la visita si existe un ID de visita
        if (createSaleDto.registroVisitaId) {
          await prisma.visita.update({
            where: { id: createSaleDto.registroVisitaId },
            data: {
              ventas: { connect: { id: newSale.id } },
            },
          });
        }

        // 6. Crear notificación de la venta
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
  ) {
    if (!dto.creditoInicial && dto.creditoInicial !== 0) {
      throw new Error('Crédito inicial requerido para ventas a crédito');
    }

    const fechaInicioCredito = dayjs()
      .tz('America/Guatemala')
      .startOf('day')
      .toDate();

    const montoInteres = dto.montoConDescuento * (dto.interes / 100);
    const montoTotalConInteres = dto.montoConDescuento + montoInteres;
    const creditoInicial = dto.creditoInicial || 0;
    const numeroCuotas = dto.numeroCuotas;

    if (creditoInicial > montoTotalConInteres) {
      throw new Error('El crédito inicial excede el monto total');
    }

    // 1. Crear registro de crédito
    const nuevoCredito = await prisma.credito.create({
      data: {
        venta: { connect: { id: sale.id } },
        cliente: { connect: { id: dto.clienteId } },
        empresa: { connect: { id: dto.empresaId } },
        montoTotal: dto.montoConDescuento,
        cuotaInicial: creditoInicial,
        totalPagado: creditoInicial,
        numeroCuotas: numeroCuotas,
        interes: dto.interes,
        montoConInteres: montoInteres,
        montoTotalConInteres: montoTotalConInteres,
        saldoPendiente: montoTotalConInteres - creditoInicial,
        diasEntrePagos: dto.diasEntrePagos ?? 30,
        estado: 'ACTIVO',
        dpi: dto.dpi || '',
        comentario: dto.comentario,
        testigos: dto.testigos ?? {},
        fechaInicio: fechaInicioCredito,
        fechaContrato: fechaInicioCredito,
      },
    });

    // 2. Crear cuotas individuales
    const montoPorCuota =
      (montoTotalConInteres - creditoInicial) / numeroCuotas;
    const fechaInicio = dayjs(fechaInicioCredito);

    for (let i = 1; i <= numeroCuotas; i++) {
      const fechaVencimiento = fechaInicio
        .add(dto.diasEntrePagos * i, 'day')
        .toDate();

      await prisma.cuotaCredito.create({
        data: {
          creditoId: nuevoCredito.id,
          montoEsperado: montoPorCuota,
          montoPagado: 0,
          estado: 'PENDIENTE',
          fechaVencimiento,
        },
      });
    }

    // 3. Actualizar monto registrado en la venta
    await prisma.venta.update({
      where: { id: sale.id },
      data: {
        monto: creditoInicial, // Solo el enganche contado como ingreso inmediato
      },
    });

    return creditoInicial;
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

  // private async createSaleNotification(sale: Venta, dto: CreateSaleDto) {
  //   const [cliente, vendedor] = await Promise.all([
  //     this.prisma.cliente.findUnique({ where: { id: dto.clienteId } }),
  //     this.prisma.usuario.findUnique({ where: { id: dto.vendedorId } }),
  //   ]);

  //   if (!cliente || !vendedor) return;

  //   const formattedAmount = new Intl.NumberFormat('es-GT', {
  //     style: 'currency',
  //     currency: 'GTQ',
  //   }).format(sale.montoConDescuento);

  //   // if (dto.visita === true) {
  //   //   await this.notificationService.createNotification({
  //   //     mensaje: `${vendedor.nombre} ha registrado una venta durante una vista, de ${formattedAmount} para ${cliente.nombre}.`,
  //   //     remitenteId: vendedor.id,
  //   //   });
  //   // }

  //   // Validar si la venta ocurrió en una visita
  //   if (dto.visita || dto.registroVisitaId) {
  //     try {
  //       await this.notificationService.createNotification({
  //         mensaje: `${vendedor.nombre} ha registrado una venta durante una visita, de ${formattedAmount} para ${cliente.nombre}.`,
  //         remitenteId: vendedor.id,
  //       });
  //       console.log(
  //         '✅ Notificación de venta en visita enviada correctamente.',
  //       );
  //     } catch (error) {
  //       console.error('❌ Error al crear notificación de visita:', error);
  //     }
  //   }

  //   await this.notificationService.createNotification({
  //     mensaje: `${vendedor.nombre} ha registrado una venta de ${formattedAmount} para ${cliente.nombre}.`,
  //     remitenteId: vendedor.id,
  //   });
  // }

  async createSaleForRegist(createSaleDto: CreateSaleDto) {
    console.log('Los datos llegando son: ', createSaleDto);
    console.log(
      'El ID de la visita abierta es: ',
      createSaleDto.registroVisitaId,
    );

    try {
      return await this.prisma.$transaction(async (prisma) => {
        // Verificar stock de cada producto
        for (const producto of createSaleDto.productos) {
          const productoEncontrado = await prisma.producto.findUnique({
            where: { id: producto.productoId },
          });

          if (!productoEncontrado) {
            throw new Error(
              `No se encontró el producto con ID: ${producto.productoId}`,
            );
          }

          const stockDeProducto = await prisma.stock.findUnique({
            where: { productoId: productoEncontrado.id },
          });

          if (
            !stockDeProducto ||
            stockDeProducto.cantidad < producto.cantidad
          ) {
            throw new Error(
              `Stock insuficiente para el producto con ID: ${productoEncontrado.id}`,
            );
          }
        }

        // Crear la venta
        const newSale = await prisma.venta.create({
          data: {
            clienteId: createSaleDto.clienteId,
            usuarioId: createSaleDto.vendedorId,
            descuento: createSaleDto.descuento || null,
            metodoPago: createSaleDto.metodoPago,
            monto: createSaleDto.monto,
            montoConDescuento: createSaleDto.montoConDescuento,
            productos: {
              create: createSaleDto.productos.map((prod) => ({
                producto: { connect: { id: prod.productoId } },
                cantidad: prod.cantidad,
                precio: prod.precio,
              })),
            },
          },
          include: { productos: { include: { producto: true } } },
        });

        if (!newSale || !newSale.id) {
          throw new Error('La venta no se creó correctamente.');
        }

        console.log('La venta hecha es: ', newSale);

        // Validar cliente
        const cliente = await prisma.cliente.findUnique({
          where: { id: createSaleDto.clienteId },
        });

        if (!cliente) {
          throw new Error(
            `El cliente con ID ${createSaleDto.clienteId} no existe.`,
          );
        }

        // Inicializar variables para actualizar ingresos
        let ingresoIncrement = 0;

        // Si es un crédito, manejar la lógica específica
        if (createSaleDto.metodoPago === 'CREDITO') {
          const {
            creditoInicial = 0,
            interes = 0,
            numeroCuotas = 0,
          } = createSaleDto;

          // Validar número de cuotas
          if (numeroCuotas <= 0) {
            throw new Error('El número de cuotas debe ser mayor a 0.');
          }

          // Calcular el monto de interés
          const montoInteres =
            createSaleDto.montoConDescuento * (interes / 100);

          // Calcular el monto total con interés
          const montoTotalConInteres =
            createSaleDto.montoConDescuento + montoInteres;

          // Calcular el saldo pendiente
          const saldoPendiente = montoTotalConInteres - creditoInicial;

          if (saldoPendiente < 0) {
            throw new Error(
              'El crédito inicial no puede ser mayor que el monto total con interés.',
            );
          }

          // Crear el registro del crédito
          // await prisma.credito.create({
          //   data: {
          //     // ventaId: newSale.id,
          //     venta: { connect: { id: newSale.id } }, // <-- Conexión correcta
          //     clienteId: createSaleDto.clienteId,
          //     empresaId: createSaleDto.empresaId,
          //     montoTotal: createSaleDto.montoConDescuento,
          //     cuotaInicial: creditoInicial,
          //     totalPagado: creditoInicial,
          //     numeroCuotas,
          //     interes,
          //     montoConInteres: montoInteres,
          //     montoTotalConInteres,
          //     saldoPendiente,
          //     dpi: createSaleDto.dpi || '',
          //     comentario: createSaleDto.comentario || null,
          //     testigos: createSaleDto.testigos || {},
          //     estado: 'ACTIVO',
          //   },
          // });

          await prisma.credito.create({
            data: {
              // ventaId: newSale.id,
              venta: { connect: { id: newSale.id } }, // <-- Conexión correcta
              cliente: { connect: { id: createSaleDto.clienteId } }, // Relación en lugar de clienteId
              empresa: { connect: { id: createSaleDto.empresaId } }, // Solo relación, quita empresaId
              montoTotal: createSaleDto.montoConDescuento,
              // Monto y pagos
              cuotaInicial: createSaleDto.creditoInicial ?? 0,
              totalPagado: createSaleDto.creditoInicial ?? 0,

              // Información del crédito
              numeroCuotas: createSaleDto.numeroCuotas ?? 0,
              interes: createSaleDto.interes ?? 0,

              // Monto con interés
              montoConInteres: montoInteres,
              montoTotalConInteres: montoTotalConInteres ?? montoInteres,

              // Saldo pendiente después del pago inicial
              saldoPendiente:
                (montoTotalConInteres ?? montoInteres) -
                (createSaleDto.creditoInicial ?? 0),

              // Datos adicionales
              dpi: createSaleDto.dpi || '',
              comentario: createSaleDto.comentario || null,
              testigos: createSaleDto.testigos ?? {}, // Objeto vacío en caso de `undefined`
              estado: 'ACTIVO',

              // Configuración de pagos
              diasEntrePagos: createSaleDto.diasEntrePagos ?? 30, // Default si no se envía
            },
          });

          // Incrementar ingresos solo con el pago inicial en caso de crédito
          ingresoIncrement = creditoInicial;

          // Actualizar la venta con el total con interés
          await prisma.venta.update({
            where: { id: newSale.id },
            data: {
              monto: montoTotalConInteres,
            },
          });
        } else {
          // Si es una venta normal, incrementar con el monto total con descuento
          ingresoIncrement = newSale.montoConDescuento;
        }

        // Actualizar ingresos empresa
        if (ingresoIncrement > 0) {
          await prisma.ingresosEmpresa.update({
            where: { id: createSaleDto.empresaId },
            data: {
              ingresosTotales: { increment: ingresoIncrement },
              saldoActual: { increment: ingresoIncrement },
              numeroVentas: { increment: 1 },
            },
          });
        }

        // Actualizar stock de los productos
        for (const producto of createSaleDto.productos) {
          await prisma.stock.update({
            where: { productoId: producto.productoId },
            data: { cantidad: { decrement: producto.cantidad } },
          });
        }

        // Actualizar registro de visita
        if (createSaleDto.registroVisitaId) {
          await prisma.visita.update({
            where: { id: createSaleDto.registroVisitaId },
            data: {
              ventas: { connect: { id: newSale.id } },
            },
          });
        }

        console.log('Venta finalizada: ', newSale);
        return newSale;
      });
    } catch (error) {
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
  //
  // async removeSale(
  //   saleId: number,
  //   userId: number,
  //   adminPassword: string,
  //   sucursalId: number,
  // ): Promise<boolean> {
  //   // Buscar al usuario en la base de datos
  //   const user = await this.prisma.usuario.findUnique({
  //     where: { id: userId },
  //   });

  //   console.log('buscnado user: ', user);

  //   if (!user) {
  //     throw new NotFoundException('Usuario no encontrado.');
  //   }

  //   // Validar la contraseña del usuario
  //   const isPasswordValid = await bcrypt.compare(
  //     adminPassword,
  //     user.contrasena,
  //   );
  //   if (!isPasswordValid) {
  //     throw new UnauthorizedException('Contraseña inválida.');
  //   }

  //   // Verificar que la venta exista
  //   const sale = await this.prisma.venta.findUnique({
  //     where: { id: saleId },
  //   });

  //   if (!sale) {
  //     throw new NotFoundException('Venta no encontrada.');
  //   }

  //   // Eliminar la venta
  //   await this.prisma.venta.delete({
  //     where: { id: saleId },
  //   });

  //   //eliminar la ganancia y venta contador:
  //   await this.prisma.ingresosEmpresa.update({
  //     where: {
  //       id: sucursalId,
  //     },
  //     data: {
  //       saldoActual: {
  //         decrement: sale.montoConDescuento,
  //       },
  //       numeroVentas: {
  //         decrement: 1,
  //       },
  //       egresosTotales: {
  //         increment: sale.montoConDescuento,
  //       },
  //     },
  //   });

  //   return true;
  // }

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
