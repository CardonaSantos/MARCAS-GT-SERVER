import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  BillingDirectoryPort,
  BillingPage,
  BillingQueryPort,
} from '../../../application/ports/billing-query.port';
import {
  BillingCandidateFilters,
  BillingPageMeta,
  BillingRangeFilters,
  BillingReadScope,
  InvoiceListFilters,
} from '../../../application/models/billing.models';

const ACTIVE_INVOICE_STATES = ['BORRADOR', 'LISTA_EMISION', 'EMITIDA'] as const;

function pageMeta(page: number, limit: number, total: number): BillingPageMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function scopeWhere(scope: BillingReadScope): Prisma.FacturaWhereInput {
  return {
    empresaId: scope.empresaId,
    ...(scope.vendedorId
      ? { pedido: { vendedorId: scope.vendedorId } }
      : {}),
  };
}

function invoiceInclude() {
  return {
    cliente: {
      include: {
        perfilFiscal: true,
      },
    },
    pedido: {
      include: {
        vendedor: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
      },
    },
    creadoPor: {
      select: { id: true, nombre: true, correo: true, rol: true },
    },
    entregas: {
      include: {
        entrega: {
          select: {
            id: true,
            estado: true,
            entregadoEn: true,
            finalizadaEn: true,
          },
        },
      },
    },
    detalles: {
      orderBy: { id: 'asc' as const },
      include: {
        producto: {
          select: {
            id: true,
            codigoProducto: true,
            nombre: true,
          },
        },
        impuestos: true,
      },
    },
    documentoFiscal: {
      include: {
        establecimiento: true,
        proveedorConfig: {
          include: { proveedorFel: true },
        },
        artefactos: {
          orderBy: { creadoEn: 'desc' as const },
        },
        operaciones: {
          orderBy: { creadoEn: 'desc' as const },
          take: 5,
          include: {
            intentosHttp: {
              orderBy: { numeroIntento: 'desc' as const },
              take: 3,
            },
          },
        },
      },
    },
    cuentaPorCobrar: true,
    eventos: {
      orderBy: { creadoEn: 'desc' as const },
      take: 5,
      include: {
        usuario: {
          select: { id: true, nombre: true, correo: true, rol: true },
        },
      },
    },
  } as const;
}

@Injectable()
export class BillingPrismaQueryAdapter
  implements BillingQueryPort, BillingDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: InvoiceListFilters,
  ): Promise<BillingPage<Record<string, unknown>>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const where: Prisma.FacturaWhereInput = {
      ...scopeWhere(filters.scope),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.estadoFiscal
        ? { documentoFiscal: { estado: filters.estadoFiscal as never } }
        : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.pedidoId ? { pedidoId: filters.pedidoId } : {}),
      ...(filters.vendedorId
        ? { pedido: { vendedorId: filters.vendedorId } }
        : {}),
      ...(filters.condicionPago
        ? { condicionPago: filters.condicionPago as never }
        : {}),
      ...(filters.soloPendientesFel
        ? {
            estado: 'LISTA_EMISION',
            OR: [
              { documentoFiscal: { estado: 'PREPARADO' } },
              { documentoFiscal: { estado: 'EN_PROCESO' } },
            ],
          }
        : {}),
      ...(filters.soloErroresFel
        ? {
            documentoFiscal: {
              estado: { in: ['RECHAZADO', 'CERTIFICACION_INCIERTA'] },
            },
          }
        : {}),
      ...(filters.soloInciertas
        ? { documentoFiscal: { estado: 'CERTIFICACION_INCIERTA' } }
        : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
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
                  numero: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                numero: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                serie: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                documentoFiscal: {
                  uuid: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.factura.count({ where }),
      this.prisma.factura.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          [filters.sortBy || 'creadoEn']:
            filters.sortDir === 'asc' ? 'asc' : 'desc',
        },
        include: {
          cliente: { include: { perfilFiscal: true } },
          pedido: {
            include: {
              vendedor: {
                select: { id: true, nombre: true, correo: true, rol: true },
              },
            },
          },
          documentoFiscal: {
            include: {
              establecimiento: true,
              proveedorConfig: {
                include: { proveedorFel: true },
              },
            },
          },
          cuentaPorCobrar: true,
          entregas: {
            include: {
              entrega: {
                select: { id: true, estado: true, finalizadaEn: true },
              },
            },
          },
          _count: { select: { detalles: true, eventos: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        estado: row.estado,
        numero: row.numero,
        serie: row.serie,
        moneda: row.moneda,
        subtotal: row.subtotal.toFixed(2),
        descuentoTotal: row.descuentoTotal.toFixed(2),
        impuestoTotal: row.impuestoTotal.toFixed(2),
        total: row.total.toFixed(2),
        condicionPago: row.condicionPago,
        cliente: {
          id: row.cliente.id,
          nombreCompleto: [row.cliente.nombre, row.cliente.apellido]
            .filter(Boolean)
            .join(' '),
          fiscalReady: Boolean(row.cliente.perfilFiscal),
        },
        pedido: row.pedido
          ? {
              id: row.pedido.id,
              numero:
                row.pedido.numero ??
                `PED-${String(row.pedido.id).padStart(6, '0')}`,
              vendedor: row.pedido.vendedor,
            }
          : null,
        entregas: row.entregas.map((item) => item.entrega),
        fiscal: row.documentoFiscal
          ? {
              id: row.documentoFiscal.id,
              estado: row.documentoFiscal.estado,
              tipoDte: row.documentoFiscal.tipoDte,
              serieInterna: row.documentoFiscal.serieInterna,
              numeroInterno: row.documentoFiscal.numeroInterno,
              uuid: row.documentoFiscal.uuid,
              serieFel: row.documentoFiscal.serieFel,
              numeroFel: row.documentoFiscal.numeroFel,
              establecimiento: row.documentoFiscal.establecimiento,
              proveedor:
                row.documentoFiscal.proveedorConfig?.proveedorFel ?? null,
            }
          : null,
        cuentaPorCobrar: row.cuentaPorCobrar
          ? {
              id: row.cuentaPorCobrar.id,
              estado: row.cuentaPorCobrar.estado,
              montoOriginal: row.cuentaPorCobrar.montoOriginal.toFixed(2),
              saldoPendiente: row.cuentaPorCobrar.saldoPendiente.toFixed(2),
              fechaVencimiento: row.cuentaPorCobrar.fechaVencimiento,
            }
          : null,
        counts: row._count,
        emitidaEn: row.emitidaEn,
        creadoEn: row.creadoEn,
        actualizadoEn: row.actualizadoEn,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async listCandidates(
    filters: BillingCandidateFilters,
  ): Promise<BillingPage<Record<string, unknown>>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;
    const sellerCondition = filters.scope.vendedorId
      ? Prisma.sql`AND p."vendedorId" = ${filters.scope.vendedorId}`
      : Prisma.empty;
    const clientCondition = filters.clienteId
      ? Prisma.sql`AND e."clienteId" = ${filters.clienteId}`
      : Prisma.empty;
    const orderCondition = filters.pedidoId
      ? Prisma.sql`AND e."pedidoId" = ${filters.pedidoId}`
      : Prisma.empty;
    const searchCondition = filters.search
      ? Prisma.sql`AND (
          c."nombre" ILIKE ${`%${filters.search}%`}
          OR COALESCE(c."apellido",'') ILIKE ${`%${filters.search}%`}
          OR COALESCE(p."numero",'') ILIKE ${`%${filters.search}%`}
        )`
      : Prisma.empty;

    const baseWhere = Prisma.sql`
      e."estado" IN ('ENTREGADA','PARCIAL')
      AND p."empresaId" = ${filters.scope.empresaId}
      ${sellerCondition}
      ${clientCondition}
      ${orderCondition}
      ${searchCondition}
      AND EXISTS (
        SELECT 1
        FROM "EntregaDetalle" ed
        WHERE ed."entregaId" = e."id"
          AND ed."cantidadEntregada" > COALESCE((
            SELECT SUM(fd."cantidad")
            FROM "FacturaDetalle" fd
            JOIN "Factura" f ON f."id" = fd."facturaId"
            WHERE fd."entregaDetalleId" = ed."id"
              AND f."estado" IN ('BORRADOR','LISTA_EMISION','EMITIDA')
          ), 0)
      )
    `;

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Entrega" e
        JOIN "Pedido" p ON p."id" = e."pedidoId"
        JOIN "Cliente" c ON c."id" = e."clienteId"
        WHERE ${baseWhere}
      `,
    );
    const ids = await this.prisma.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT e."id"
        FROM "Entrega" e
        JOIN "Pedido" p ON p."id" = e."pedidoId"
        JOIN "Cliente" c ON c."id" = e."clienteId"
        WHERE ${baseWhere}
        ORDER BY e."finalizadaEn" DESC NULLS LAST, e."id" DESC
        OFFSET ${offset}
        LIMIT ${limit}
      `,
    );

    if (!ids.length) {
      return {
        data: [],
        meta: pageMeta(page, limit, Number(totalRows[0]?.count ?? 0n)),
      };
    }

    const rows = await this.prisma.entrega.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: {
        cliente: { include: { perfilFiscal: true } },
        pedido: {
          include: {
            vendedor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
          },
        },
        detalles: {
          include: {
            producto: { include: { perfilFiscal: true } },
            pedidoDetalle: true,
            facturaDetalles: {
              where: {
                factura: { estado: { in: [...ACTIVE_INVOICE_STATES] } },
              },
              select: { cantidad: true },
            },
          },
        },
      },
    });
    const orderIndex = new Map(ids.map((row, index) => [row.id, index]));
    rows.sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);

    return {
      data: rows.map((row) => {
        const lines = row.detalles.map((detail) => {
          const billed = detail.facturaDetalles.reduce(
            (sum, item) => sum + item.cantidad,
            0,
          );
          const available = Math.max(0, detail.cantidadEntregada - billed);
          return {
            entregaDetalleId: detail.id,
            pedidoDetalleId: detail.pedidoDetalleId,
            producto: {
              id: detail.producto.id,
              codigo: detail.producto.codigoProducto,
              nombre: detail.producto.nombre,
            },
            entregada: detail.cantidadEntregada,
            facturada: billed,
            disponibleFacturar: available,
            precioUnitario: detail.pedidoDetalle.precioUnitario.toFixed(2),
            descuentoPedido: detail.pedidoDetalle.descuento.toFixed(2),
            fiscalReady: Boolean(
              detail.producto.perfilFiscal?.activo,
            ),
            fiscal: detail.producto.perfilFiscal,
          };
        });
        const warnings: Array<Record<string, unknown>> = [];
        if (!row.cliente.perfilFiscal) {
          warnings.push({
            codigo: 'FISCAL_CUSTOMER_PROFILE_MISSING',
            nivel: 'ADVERTENCIA',
            mensaje: 'El cliente no tiene perfil fiscal configurado.',
          });
        }
        const missingProducts = lines
          .filter((line) => !line.fiscalReady)
          .map((line) => line.producto.id);
        if (missingProducts.length) {
          warnings.push({
            codigo: 'FISCAL_PRODUCT_PROFILE_MISSING',
            nivel: 'ADVERTENCIA',
            mensaje: 'Hay productos sin perfil fiscal activo.',
            productoIds: missingProducts,
          });
        }

        return {
          entrega: {
            id: row.id,
            estado: row.estado,
            entregadoEn: row.entregadoEn,
            finalizadaEn: row.finalizadaEn,
          },
          pedido: {
            id: row.pedido.id,
            numero:
              row.pedido.numero ??
              `PED-${String(row.pedido.id).padStart(6, '0')}`,
            condicionPago: row.pedido.condicionPago,
            moneda: row.pedido.moneda,
            vendedor: row.pedido.vendedor,
          },
          cliente: {
            id: row.cliente.id,
            nombreCompleto: [row.cliente.nombre, row.cliente.apellido]
              .filter(Boolean)
              .join(' '),
            telefono: row.cliente.telefono,
            correo: row.cliente.correo,
            fiscalReady: Boolean(row.cliente.perfilFiscal),
            fiscal: row.cliente.perfilFiscal,
          },
          lineas: lines,
          unidadesDisponibles: lines.reduce(
            (sum, line) => sum + line.disponibleFacturar,
            0,
          ),
          facturable: lines.some((line) => line.disponibleFacturar > 0),
          fiscalReady:
            Boolean(row.cliente.perfilFiscal) &&
            lines.every((line) => line.fiscalReady),
          advertencias: warnings,
        };
      }),
      meta: pageMeta(page, limit, Number(totalRows[0]?.count ?? 0n)),
    };
  }

  async getById(
    id: number,
    scope: BillingReadScope,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.factura.findFirst({
      where: { id, ...scopeWhere(scope) },
      include: invoiceInclude(),
    });
    if (!row) return null;

    const fiscal = row.documentoFiscal;
    const currentOperation = fiscal?.operaciones?.[0] ?? null;
    const warnings: Array<Record<string, unknown>> = [];
    if (!row.cliente.perfilFiscal) {
      warnings.push({
        codigo: 'FISCAL_CUSTOMER_PROFILE_MISSING',
        nivel: 'ADVERTENCIA',
        mensaje: 'El cliente no tiene perfil fiscal configurado.',
      });
    }
    if (row.estado === 'LISTA_EMISION' && !fiscal) {
      warnings.push({
        codigo: 'FISCAL_DOCUMENT_MISSING',
        nivel: 'CRITICO',
        mensaje: 'La factura está lista para emisión pero no tiene documento fiscal.',
      });
    }
    if (
      fiscal &&
      ['RECHAZADO', 'CERTIFICACION_INCIERTA'].includes(fiscal.estado)
    ) {
      warnings.push({
        codigo: 'FEL_REQUIRES_ATTENTION',
        nivel: 'CRITICO',
        mensaje: 'El documento fiscal requiere intervención.',
      });
    }

    return {
      id: row.id,
      estado: row.estado,
      version: row.version,
      numero: row.numero,
      serie: row.serie,
      condicionPago: row.condicionPago,
      moneda: row.moneda,
      totales: {
        subtotal: row.subtotal.toFixed(2),
        descuento: row.descuentoTotal.toFixed(2),
        impuestos: row.impuestoTotal.toFixed(2),
        total: row.total.toFixed(2),
      },
      cliente: {
        id: row.cliente.id,
        nombre: row.cliente.nombre,
        apellido: row.cliente.apellido,
        nombreCompleto: [row.cliente.nombre, row.cliente.apellido]
          .filter(Boolean)
          .join(' '),
        telefono: row.cliente.telefono,
        correo: row.cliente.correo,
        direccion: row.cliente.direccion,
        fiscal: row.cliente.perfilFiscal,
      },
      pedido: row.pedido
        ? {
            id: row.pedido.id,
            numero:
              row.pedido.numero ??
              `PED-${String(row.pedido.id).padStart(6, '0')}`,
            estado: row.pedido.estado,
            condicionPago: row.pedido.condicionPago,
            estadoPago: row.pedido.estadoPago,
            vendedor: row.pedido.vendedor,
          }
        : null,
      creadoPor: row.creadoPor,
      entregas: row.entregas.map((item) => item.entrega),
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        producto: detail.producto,
        pedidoDetalleId: detail.pedidoDetalleId,
        entregaDetalleId: detail.entregaDetalleId,
        descripcion: detail.descripcion,
        bienOServicio: detail.bienOServicio,
        unidadMedida: detail.unidadMedida,
        cantidad: detail.cantidad,
        precioUnitario: detail.precioUnitario.toFixed(2),
        precioBruto: detail.precioBruto.toFixed(2),
        descuento: detail.descuento.toFixed(2),
        impuestoTotal: detail.impuestoTotal.toFixed(2),
        totalLinea: detail.totalLinea.toFixed(2),
        impuestos: detail.impuestos.map((tax) => ({
          ...tax,
          tasa: tax.tasa?.toFixed(4) ?? null,
          montoGravable: tax.montoGravable.toFixed(8),
          montoImpuesto: tax.montoImpuesto.toFixed(8),
        })),
      })),
      fiscal: fiscal
        ? {
            id: fiscal.id,
            estado: fiscal.estado,
            entorno: fiscal.entorno,
            tipoDte: fiscal.tipoDte,
            serieInterna: fiscal.serieInterna,
            numeroInterno: fiscal.numeroInterno,
            uuid: fiscal.uuid,
            serieFel: fiscal.serieFel,
            numeroFel: fiscal.numeroFel,
            fechaHoraEmision: fiscal.fechaHoraEmision,
            fechaCertificacion: fiscal.fechaCertificacion,
            payloadHash: fiscal.payloadHash,
            establecimiento: fiscal.establecimiento,
            proveedor: fiscal.proveedorConfig
              ? {
                  id: fiscal.proveedorConfig.id,
                  entorno: fiscal.proveedorConfig.entorno,
                  nombre: fiscal.proveedorConfig.proveedorFel.nombre,
                  codigo: fiscal.proveedorConfig.proveedorFel.codigo,
                }
              : null,
            operacionActual: currentOperation,
            artefactos: fiscal.artefactos,
          }
        : null,
      cuentaPorCobrar: row.cuentaPorCobrar
        ? {
            ...row.cuentaPorCobrar,
            montoOriginal: row.cuentaPorCobrar.montoOriginal.toFixed(2),
            saldoPendiente: row.cuentaPorCobrar.saldoPendiente.toFixed(2),
          }
        : null,
      eventosRecientes: row.eventos,
      advertencias: warnings,
      acciones: {
        puedeEditar: row.estado === 'BORRADOR',
        puedeDescartar: row.estado === 'BORRADOR',
        puedePreparar: row.estado === 'BORRADOR',
        puedeEmitir:
          row.estado === 'LISTA_EMISION' &&
          fiscal?.estado === 'PREPARADO' &&
          Boolean(fiscal.proveedorConfig),
        puedeReintentar: Boolean(
          currentOperation &&
            ['REINTENTABLE', 'FALLIDA'].includes(currentOperation.estado),
        ),
        puedeReconciliar: Boolean(
          currentOperation?.estado === 'INCIERTA' ||
            fiscal?.estado === 'CERTIFICACION_INCIERTA',
        ),
        puedeAnular: row.estado === 'EMITIDA',
      },
      fechas: {
        creadoEn: row.creadoEn,
        actualizadoEn: row.actualizadoEn,
        emitidaEn: row.emitidaEn,
        descartadaEn: row.descartadaEn,
        anuladaEn: row.anuladaEn,
      },
    };
  }

  async listEvents(
    id: number,
    scope: BillingReadScope,
    page: number,
    limit: number,
  ): Promise<BillingPage<Record<string, unknown>>> {
    const visible = await this.prisma.factura.findFirst({
      where: { id, ...scopeWhere(scope) },
      select: { id: true },
    });
    if (!visible) return { data: [], meta: pageMeta(page, limit, 0) };

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const where = { facturaId: id };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.facturaEvento.count({ where }),
      this.prisma.facturaEvento.findMany({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { creadoEn: 'desc' },
        include: {
          usuario: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },
        },
      }),
    ]);
    return { data, meta: pageMeta(safePage, safeLimit, total) };
  }

  async listFelOperations(
    id: number,
    scope: BillingReadScope,
    page: number,
    limit: number,
  ): Promise<BillingPage<Record<string, unknown>>> {
    const invoice = await this.prisma.factura.findFirst({
      where: { id, ...scopeWhere(scope) },
      select: { documentoFiscal: { select: { id: true } } },
    });
    const documentId = invoice?.documentoFiscal?.id;
    if (!documentId) return { data: [], meta: pageMeta(page, limit, 0) };

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const where = { documentoFiscalId: documentId };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.felOperacion.count({ where }),
      this.prisma.felOperacion.findMany({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { creadoEn: 'desc' },
        include: {
          proveedorConfig: { include: { proveedorFel: true } },
          intentosHttp: { orderBy: { numeroIntento: 'desc' } },
        },
      }),
    ]);
    return { data, meta: pageMeta(safePage, safeLimit, total) };
  }

  async getSummary(
    filters: BillingRangeFilters,
  ): Promise<Record<string, unknown>> {
    const where: Prisma.FacturaWhereInput = {
      ...scopeWhere(filters.scope),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const [total, byState, amounts, pendingFel, uncertainFel, rejectedFel, receivables] =
      await Promise.all([
        this.prisma.factura.count({ where }),
        this.prisma.factura.groupBy({
          by: ['estado'],
          where,
          _count: { _all: true },
          _sum: { total: true, impuestoTotal: true },
        }),
        this.prisma.factura.aggregate({
          where: {
            ...where,
            estado: { in: ['LISTA_EMISION', 'EMITIDA'] },
          },
          _sum: { total: true, impuestoTotal: true, descuentoTotal: true },
        }),
        this.prisma.factura.count({
          where: {
            ...where,
            estado: 'LISTA_EMISION',
            documentoFiscal: { estado: { in: ['PREPARADO', 'EN_PROCESO'] } },
          },
        }),
        this.prisma.factura.count({
          where: {
            ...where,
            documentoFiscal: { estado: 'CERTIFICACION_INCIERTA' },
          },
        }),
        this.prisma.factura.count({
          where: { ...where, documentoFiscal: { estado: 'RECHAZADO' } },
        }),
        this.prisma.cuentaPorCobrar.aggregate({
          where: {
            empresaId: filters.scope.empresaId,
            ...(filters.scope.vendedorId
              ? { pedido: { vendedorId: filters.scope.vendedorId } }
              : {}),
          },
          _sum: { montoOriginal: true, saldoPendiente: true },
          _count: { _all: true },
        }),
      ]);

    return {
      total,
      porEstado: Object.fromEntries(
        byState.map((row) => [row.estado, row._count._all]),
      ),
      montos: {
        facturado: amounts._sum.total?.toFixed(2) ?? '0.00',
        impuestos: amounts._sum.impuestoTotal?.toFixed(2) ?? '0.00',
        descuentos: amounts._sum.descuentoTotal?.toFixed(2) ?? '0.00',
      },
      fel: {
        pendientes: pendingFel,
        inciertas: uncertainFel,
        rechazadas: rejectedFel,
      },
      cartera: {
        cuentas: receivables._count._all,
        montoOriginal: receivables._sum.montoOriginal?.toFixed(2) ?? '0.00',
        saldoPendiente:
          receivables._sum.saldoPendiente?.toFixed(2) ?? '0.00',
      },
    };
  }

  async getOperationalReport(
    filters: BillingRangeFilters,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const from =
      filters.fechaDesde ?? new Date(now.getTime() - 30 * 86400000);
    const to = filters.fechaHasta ?? now;
    const where: Prisma.FacturaWhereInput = {
      ...scopeWhere(filters.scope),
      creadoEn: { gte: from, lte: to },
    };

    const [states, fiscalStates, operations] = await Promise.all([
      this.prisma.factura.groupBy({
        by: ['estado'],
        where,
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.documentoFiscal.groupBy({
        by: ['estado'],
        where: {
          factura: where,
        },
        _count: { _all: true },
      }),
      this.prisma.felOperacion.groupBy({
        by: ['estado'],
        where: {
          documentoFiscal: { factura: where },
        },
        _count: { _all: true },
        _avg: { intentos: true },
      }),
    ]);

    return {
      rango: { desde: from, hasta: to },
      facturas: states.map((row) => ({
        estado: row.estado,
        cantidad: row._count._all,
        monto: row._sum.total?.toFixed(2) ?? '0.00',
      })),
      documentosFiscales: fiscalStates.map((row) => ({
        estado: row.estado,
        cantidad: row._count._all,
      })),
      operacionesFel: operations.map((row) => ({
        estado: row.estado,
        cantidad: row._count._all,
        intentosPromedio: row._avg.intentos ?? 0,
      })),
      integracionExterna: {
        habilitada: false,
        mensaje:
          'Grupo CDS está maquetado como proveedor, pendiente de credenciales y habilitación contractual.',
      },
    };
  }

  async listReceivables(filters: {
    page: number;
    limit: number;
    search?: string;
    estado?: string;
    clienteId?: number;
    soloVencidas?: boolean;
    scope: BillingReadScope;
  }): Promise<BillingPage<Record<string, unknown>>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const where: Prisma.CuentaPorCobrarWhereInput = {
      empresaId: filters.scope.empresaId,
      ...(filters.scope.vendedorId
        ? { pedido: { vendedorId: filters.scope.vendedorId } }
        : {}),
      ...(filters.estado ? { estado: filters.estado as never } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.soloVencidas
        ? {
            saldoPendiente: { gt: 0 },
            fechaVencimiento: { lt: new Date() },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                cliente: {
                  nombre: { contains: filters.search, mode: 'insensitive' },
                },
              },
              {
                numeroDocumento: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cuentaPorCobrar.count({ where }),
      this.prisma.cuentaPorCobrar.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ fechaVencimiento: 'asc' }, { id: 'asc' }],
        include: {
          cliente: true,
          factura: {
            select: {
              id: true,
              estado: true,
              numero: true,
              serie: true,
              total: true,
              documentoFiscal: {
                select: {
                  uuid: true,
                  serieFel: true,
                  numeroFel: true,
                },
              },
            },
          },
          pedido: {
            include: {
              vendedor: {
                select: { id: true, nombre: true, correo: true, rol: true },
              },
            },
          },
          aplicaciones: {
            include: {
              pago: {
                select: {
                  id: true,
                  estado: true,
                  metodo: true,
                  monto: true,
                  fechaPago: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const now = Date.now();
    return {
      data: rows.map((row) => ({
        id: row.id,
        estado: row.estado,
        moneda: row.moneda,
        montoOriginal: row.montoOriginal.toFixed(2),
        saldoPendiente: row.saldoPendiente.toFixed(2),
        fechaEmision: row.fechaEmision,
        fechaVencimiento: row.fechaVencimiento,
        diasVencida:
          Number(row.saldoPendiente) > 0 && row.fechaVencimiento.getTime() < now
            ? Math.floor((now - row.fechaVencimiento.getTime()) / 86400000)
            : 0,
        cliente: {
          id: row.cliente.id,
          nombreCompleto: [row.cliente.nombre, row.cliente.apellido]
            .filter(Boolean)
            .join(' '),
        },
        pedido: row.pedido,
        factura: row.factura
          ? {
              ...row.factura,
              total: row.factura.total.toFixed(2),
            }
          : null,
        aplicaciones: row.aplicaciones.map((application) => ({
          id: application.id,
          monto: application.monto.toFixed(2),
          creadoEn: application.creadoEn,
          pago: {
            ...application.pago,
            monto: application.pago.monto.toFixed(2),
          },
        })),
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async getReceivableSummary(
    filters: BillingRangeFilters,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const rows = await this.prisma.cuentaPorCobrar.findMany({
      where: {
        empresaId: filters.scope.empresaId,
        ...(filters.scope.vendedorId
          ? { pedido: { vendedorId: filters.scope.vendedorId } }
          : {}),
        ...(filters.fechaDesde || filters.fechaHasta
          ? {
              fechaEmision: {
                ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
                ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
              },
            }
          : {}),
      },
      select: {
        estado: true,
        montoOriginal: true,
        saldoPendiente: true,
        fechaVencimiento: true,
      },
    });

    const buckets = {
      vigente: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0,
    };
    let original = 0;
    let pending = 0;
    for (const row of rows) {
      const originalCents = Math.round(Number(row.montoOriginal) * 100);
      const pendingCents = Math.round(Number(row.saldoPendiente) * 100);
      original += originalCents;
      pending += pendingCents;
      if (pendingCents <= 0) continue;

      const days = Math.floor(
        (now.getTime() - row.fechaVencimiento.getTime()) / 86400000,
      );
      if (days <= 0) buckets.vigente += pendingCents;
      else if (days <= 30) buckets.d1_30 += pendingCents;
      else if (days <= 60) buckets.d31_60 += pendingCents;
      else if (days <= 90) buckets.d61_90 += pendingCents;
      else buckets.d90_plus += pendingCents;
    }

    const money = (cents: number) => (cents / 100).toFixed(2);
    return {
      cuentas: rows.length,
      montoOriginal: money(original),
      saldoPendiente: money(pending),
      aging: Object.fromEntries(
        Object.entries(buckets).map(([key, cents]) => [key, money(cents)]),
      ),
    };
  }

  async findById(id: number) {
    const row = await this.prisma.factura.findUnique({
      where: { id },
      select: {
        id: true,
        empresaId: true,
        clienteId: true,
        pedidoId: true,
        estado: true,
        total: true,
        documentoFiscal: { select: { id: true } },
        cuentaPorCobrar: { select: { id: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      pedidoId: row.pedidoId,
      estado: row.estado,
      total: row.total.toFixed(2),
      documentoFiscalId: row.documentoFiscal?.id ?? null,
      cuentaPorCobrarId: row.cuentaPorCobrar?.id ?? null,
    };
  }

}
