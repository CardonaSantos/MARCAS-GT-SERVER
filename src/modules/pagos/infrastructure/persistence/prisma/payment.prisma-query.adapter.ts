import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  PaymentDirectoryPort,
  PaymentPage,
  PaymentQueryPort,
} from '../../../application/ports/payment-query.port';
import { PaymentMoney } from '../../../domain/value-objects/payment-money.vo';
import { PaymentReadScope } from '../../../payment.types';

@Injectable()
export class PaymentPrismaQueryAdapter
  implements PaymentQueryPort, PaymentDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async listBanks(scope: PaymentReadScope) {
    return this.prisma.banco.findMany({
      where: {
        empresaId: scope.empresaId,
        activo: true,
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        codigo: true,
      },
    });
  }

  async listBanksAdmin(scope: PaymentReadScope) {
    return this.prisma.banco.findMany({
      where: { empresaId: scope.empresaId },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        codigo: true,
        cuenta: true,
        activo: true,
        creadoEn: true,
        actualizadoEn: true,
      },
    });
  }

  async list(filters: Parameters<PaymentQueryPort['list']>[0]) {
    const where: any = {
      ...scopeWhere(filters.scope),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.metodo ? { metodo: filters.metodo } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.pedidoId ? { pedidoId: filters.pedidoId } : {}),
      ...(filters.bancoId ? { bancoId: filters.bancoId } : {}),
      ...dateWhere(filters.fechaDesde, filters.fechaHasta),
      ...(filters.search
        ? {
            OR: [
              {
                referencia: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                cliente: {
                  nombre: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                cliente: {
                  apellido: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                pedido: {
                  is: {
                    numero: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const include = paymentListInclude();

    if (filters.soloConSaldoDisponible) {
      const rows = await this.prisma.pago.findMany({
        where,
        orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
        include,
      });

      const mapped = rows
        .map(mapPaymentListRow)
        .filter((row: any) =>
          PaymentMoney.from(row.montoDisponible).isPositive(),
        );

      return pageFromArray(mapped, filters.page, filters.limit);
    }

    const [total, rows] = await Promise.all([
      this.prisma.pago.count({ where }),
      this.prisma.pago.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
        include,
      }),
    ]);

    return {
      data: rows.map(mapPaymentListRow),
      meta: pageMeta(filters.page, filters.limit, total),
    };
  }

  async getById(id: number, scope: PaymentReadScope) {
    const row = await this.prisma.pago.findFirst({
      where: {
        id,
        ...scopeWhere(scope),
      },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            correo: true,
          },
        },
        pedido: {
          select: {
            id: true,
            numero: true,
            estado: true,
            condicionPago: true,
            estadoPago: true,
            total: true,
            moneda: true,
            vendedorId: true,
          },
        },
        banco: true,
        registradoPor: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
        verificadoPor: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
        rechazadoPor: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
        anuladoPor: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
        comprobantes: {
          where: { eliminadoEn: null },
          orderBy: { creadoEn: 'asc' },
          include: {
            subidoPor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
          },
        },
        aplicaciones: {
          orderBy: { creadoEn: 'asc' },
          include: {
            aplicadoPor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
            revertidaPor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
            cuentaPorCobrar: {
              include: {
                factura: {
                  select: {
                    id: true,
                    numero: true,
                    serie: true,
                    estado: true,
                    total: true,
                    emitidaEn: true,
                  },
                },
                credito: {
                  select: {
                    id: true,
                    numero: true,
                    estado: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    const applied = activeApplied(row.aplicaciones);
    const available = PaymentMoney.from(row.monto.toFixed(2)).subtract(applied);

    const operator = ['ADMIN', 'CONTABILIDAD'].includes(scope.rol);
    const directOrder = isDirectOrderPayment(row.pedido?.condicionPago);
    const linked = row.estado === 'VERIFICADO' && directOrder
      ? available : PaymentMoney.zero();
    const freeForCxC = row.estado === 'VERIFICADO' && !directOrder
      ? available : PaymentMoney.zero();

    return {
      id: row.id,
      empresaId: row.empresaId,
      cliente: row.cliente,
      pedido: row.pedido
        ? {
            ...row.pedido,
            total: row.pedido.total.toFixed(2),
          }
        : null,
      banco: row.banco,
      metodo: row.metodo,
      estado: row.estado,
      moneda: row.moneda,
      monto: row.monto.toFixed(2),
      montoAplicado: applied.toString(),
      montoDisponible: available.toString(),
      montoVinculadoPedido: linked.toString(),
      montoLibreCxC: freeForCxC.toString(),
      referencia: row.referencia,
      fechaPago: row.fechaPago,
      observaciones: row.observaciones,
      verificadoEn: row.verificadoEn,
      rechazadoEn: row.rechazadoEn,
      motivoRechazo: row.motivoRechazo,
      anuladoEn: row.anuladoEn,
      motivoAnulacion: row.motivoAnulacion,
      version: row.version,
      registradoPor: row.registradoPor,
      verificadoPor: row.verificadoPor,
      rechazadoPor: row.rechazadoPor,
      anuladoPor: row.anuladoPor,
      comprobantes: row.comprobantes,
      aplicaciones: row.aplicaciones.map(mapApplicationRead),
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      acciones: {
        puedeVerificar: operator && row.estado === 'PENDIENTE',
        puedeRechazar: operator && row.estado === 'PENDIENTE',
        puedeAplicar:
          operator &&
          row.estado === 'VERIFICADO' &&
          !directOrder &&
          available.isPositive(),
        puedeAnular: operator && row.estado === 'VERIFICADO',
        puedeAgregarComprobante:
          ['ADMIN', 'CONTABILIDAD', 'VENDEDOR'].includes(scope.rol) &&
          !['RECHAZADO', 'ANULADO'].includes(row.estado),
      },
    };
  }

  async listEvents(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ) {
    if (!(await this.existsInScope(id, scope))) {
      return emptyPage(page, limit);
    }

    const where = { pagoId: id };
    const [total, rows] = await Promise.all([
      this.prisma.pagoEvento.count({ where }),
      this.prisma.pagoEvento.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        include: {
          usuario: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },
        },
      }),
    ]);

    return {
      data: rows,
      meta: pageMeta(page, limit, total),
    };
  }

  async listApplications(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ) {
    if (!(await this.existsInScope(id, scope))) {
      return emptyPage(page, limit);
    }

    const where = { pagoId: id };
    const [total, rows] = await Promise.all([
      this.prisma.pagoAplicacion.count({ where }),
      this.prisma.pagoAplicacion.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        include: {
          aplicadoPor: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },
          revertidaPor: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },
          cuentaPorCobrar: {
            include: {
              factura: {
                select: {
                  id: true,
                  numero: true,
                  serie: true,
                  estado: true,
                  total: true,
                },
              },
              credito: {
                select: { id: true, numero: true, estado: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map(mapApplicationRead),
      meta: pageMeta(page, limit, total),
    };
  }

  async listReceivableCandidates(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ) {
    const payment = await this.prisma.pago.findFirst({
      where: {
        id,
        ...scopeWhere(scope),
      },
      include: {
        aplicaciones: {
          where: { estado: 'ACTIVA' },
          select: { monto: true },
        },
      },
    });

    if (!payment) {
      return emptyPage(page, limit);
    }

    const where: any = {
      empresaId: payment.empresaId,
      clienteId: payment.clienteId,
      moneda: payment.moneda,
      saldoPendiente: { gt: 0 },
      estado: { in: ['PENDIENTE', 'PARCIAL', 'VENCIDA'] },
      ...(payment.pedidoId ? { pedidoId: payment.pedidoId } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.cuentaPorCobrar.count({ where }),
      this.prisma.cuentaPorCobrar.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { fechaVencimiento: 'asc' },
          { id: 'asc' },
        ],
        include: {
          factura: {
            select: {
              id: true,
              numero: true,
              serie: true,
              estado: true,
              total: true,
            },
          },
          credito: {
            select: {
              id: true,
              numero: true,
              estado: true,
            },
          },
          pedido: {
            select: {
              id: true,
              numero: true,
              vendedorId: true,
            },
          },
        },
      }),
    ]);

    const applied = activeApplied(payment.aplicaciones);
    const available = PaymentMoney.from(
      payment.monto.toFixed(2),
    ).subtract(applied);

    return {
      data: rows.map((row) => ({
        id: row.id,
        empresaId: row.empresaId,
        clienteId: row.clienteId,
        pedido: row.pedido,
        factura: row.factura
          ? {
              ...row.factura,
              total: row.factura.total.toFixed(2),
            }
          : null,
        credito: row.credito,
        numeroDocumento: row.numeroDocumento,
        moneda: row.moneda,
        montoOriginal: row.montoOriginal.toFixed(2),
        saldoPendiente: row.saldoPendiente.toFixed(2),
        fechaEmision: row.fechaEmision,
        fechaVencimiento: row.fechaVencimiento,
        estado: row.estado,
        montoMaximoAplicable: minMoney(
          available,
          PaymentMoney.from(row.saldoPendiente.toFixed(2)),
        ).toString(),
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async getSummary(
    filters: Parameters<PaymentQueryPort['getSummary']>[0],
  ) {
    const where: any = {
      ...scopeWhere(filters.scope),
      ...dateWhere(filters.fechaDesde, filters.fechaHasta),
    };

    const rows = await this.prisma.pago.findMany({
      where,
      select: {
        estado: true,
        metodo: true,
        monto: true,
        aplicaciones: {
          where: { estado: 'ACTIVA' },
          select: { monto: true },
        },
        pedido: { select: { condicionPago: true } },
      },
    });

    const porEstado: Record<string, number> = {};
    const porMetodo: Record<string, number> = {};
    let verificado = PaymentMoney.zero();
    let pendiente = PaymentMoney.zero();
    let disponible = PaymentMoney.zero();
    let vinculadoPedido = PaymentMoney.zero();
    let libreCxC = PaymentMoney.zero();

    for (const row of rows) {
      porEstado[row.estado] = (porEstado[row.estado] ?? 0) + 1;
      porMetodo[row.metodo] = (porMetodo[row.metodo] ?? 0) + 1;

      const amount = PaymentMoney.from(row.monto.toFixed(2));

      if (row.estado === 'VERIFICADO') {
        verificado = verificado.add(amount);
        const remaining = amount.subtract(activeApplied(row.aplicaciones));
        disponible = disponible.add(remaining);
        if (isDirectOrderPayment(row.pedido?.condicionPago)) {
          vinculadoPedido = vinculadoPedido.add(remaining);
        } else {
          libreCxC = libreCxC.add(remaining);
        }
      } else if (row.estado === 'PENDIENTE') {
        pendiente = pendiente.add(amount);
      }
    }

    return {
      total: rows.length,
      porEstado,
      porMetodo,
      montos: {
        verificado: verificado.toString(),
        pendiente: pendiente.toString(),
        disponibleNoAplicado: disponible.toString(),
        vinculadoPedido: vinculadoPedido.toString(),
        libreCxC: libreCxC.toString(),
      },
    };
  }

  async findById(id: number) {
    const row = await this.prisma.pago.findUnique({
      where: { id },
      include: {
        aplicaciones: {
          where: { estado: 'ACTIVA' },
          select: { monto: true },
        },
      },
    });

    if (!row) {
      return null;
    }

    const applied = activeApplied(row.aplicaciones);
    const available = PaymentMoney.from(row.monto.toFixed(2)).subtract(applied);

    return {
      id: row.id,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      pedidoId: row.pedidoId,
      estado: row.estado,
      moneda: row.moneda,
      monto: row.monto.toFixed(2),
      montoAplicado: applied.toString(),
      montoDisponible: available.toString(),
    };
  }

  private async existsInScope(
    id: number,
    scope: PaymentReadScope,
  ): Promise<boolean> {
    const row = await this.prisma.pago.findFirst({
      where: {
        id,
        ...scopeWhere(scope),
      },
      select: { id: true },
    });

    return Boolean(row);
  }
}

function scopeWhere(scope: PaymentReadScope): any {
  return {
    empresaId: scope.empresaId,
    ...(scope.vendedorId
      ? {
          pedido: {
            is: {
              vendedorId: scope.vendedorId,
            },
          },
        }
      : {}),
  };
}

function dateWhere(fechaDesde?: Date, fechaHasta?: Date): any {
  if (!fechaDesde && !fechaHasta) {
    return {};
  }

  return {
    fechaPago: {
      ...(fechaDesde ? { gte: fechaDesde } : {}),
      ...(fechaHasta ? { lte: fechaHasta } : {}),
    },
  };
}

function isDirectOrderPayment(value: string | null | undefined): boolean {
  return value === 'PREPAGO' || value === 'CONTRAENTREGA';
}

function paymentListInclude(): any {
  return {
    cliente: {
      select: {
        id: true,
        nombre: true,
        apellido: true,
      },
    },
    pedido: {
      select: {
        id: true,
        numero: true,
        vendedorId: true,
        condicionPago: true,
        estadoPago: true,
      },
    },
    banco: {
      select: {
        id: true,
        nombre: true,
      },
    },
    registradoPor: {
      select: {
        id: true,
        nombre: true,
        rol: true,
      },
    },
    aplicaciones: {
      where: { estado: 'ACTIVA' },
      select: { monto: true },
    },
    _count: {
      select: {
        comprobantes: { where: { eliminadoEn: null } },
      },
    },
  };
}

function mapPaymentListRow(row: any) {
  const applied = activeApplied(row.aplicaciones);
  const amount = PaymentMoney.from(row.monto.toFixed(2));

  return {
    id: row.id,
    cliente: row.cliente,
    pedido: row.pedido,
    banco: row.banco,
    registradoPor: row.registradoPor,
    metodo: row.metodo,
    estado: row.estado,
    moneda: row.moneda,
    monto: amount.toString(),
    montoAplicado: applied.toString(),
    montoDisponible: amount.subtract(applied).toString(),
    montoVinculadoPedido: row.estado === 'VERIFICADO' &&
      isDirectOrderPayment(row.pedido?.condicionPago)
      ? amount.subtract(applied).toString() : '0.00',
    montoLibreCxC: row.estado === 'VERIFICADO' &&
      !isDirectOrderPayment(row.pedido?.condicionPago)
      ? amount.subtract(applied).toString() : '0.00',
    referencia: row.referencia,
    fechaPago: row.fechaPago,
    comprobantes: row._count.comprobantes,
    creadoEn: row.creadoEn,
  };
}

function mapApplicationRead(row: any) {
  return {
    id: row.id,
    pagoId: row.pagoId,
    cuentaPorCobrarId: row.cuentaPorCobrarId,
    monto: row.monto.toFixed(2),
    estado: row.estado,
    aplicadoPor: row.aplicadoPor,
    revertidaEn: row.revertidaEn,
    revertidaPor: row.revertidaPor,
    motivoReversion: row.motivoReversion,
    claveIdempotencia: row.claveIdempotencia,
    version: row.version,
    creadoEn: row.creadoEn,
    cuentaPorCobrar: {
      ...row.cuentaPorCobrar,
      montoOriginal: row.cuentaPorCobrar.montoOriginal.toFixed(2),
      saldoPendiente: row.cuentaPorCobrar.saldoPendiente.toFixed(2),
      factura: row.cuentaPorCobrar.factura
        ? {
            ...row.cuentaPorCobrar.factura,
            total: row.cuentaPorCobrar.factura.total.toFixed(2),
          }
        : null,
    },
  };
}

function activeApplied(applications: readonly any[]): PaymentMoney {
  return applications.reduce((total, row) => {
    if (row.estado !== undefined && row.estado !== 'ACTIVA') {
      return total;
    }

    return total.add(PaymentMoney.from(row.monto.toFixed(2)));
  }, PaymentMoney.zero());
}

function minMoney(a: PaymentMoney, b: PaymentMoney): PaymentMoney {
  return a.gt(b) ? b : a;
}

function pageMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function emptyPage(page: number, limit: number): PaymentPage<Record<string, unknown>> {
  return {
    data: [],
    meta: pageMeta(page, limit, 0),
  };
}

function pageFromArray(
  rows: Record<string, unknown>[],
  page: number,
  limit: number,
): PaymentPage<Record<string, unknown>> {
  const total = rows.length;
  const start = (page - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    meta: pageMeta(page, limit, total),
  };
}
