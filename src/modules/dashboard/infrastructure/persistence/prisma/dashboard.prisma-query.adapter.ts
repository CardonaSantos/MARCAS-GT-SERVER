import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { AdminDashboardSection, DashboardScope } from '../../../domain/dashboard.models';
import { DashboardQueryPort } from '../../../application/ports/dashboard-query.port';

const money = (value: Prisma.Decimal | string | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toFixed(2);
const date = (value: Date | null | undefined) => value?.toISOString() ?? null;
const periodo = (scope: DashboardScope) => ({ gte: scope.desde, lt: scope.hasta });
const carteraActiva = ['PENDIENTE', 'PARCIAL', 'VENCIDA'] as const;

@Injectable()
export class DashboardPrismaQueryAdapter implements DashboardQueryPort {
  constructor(private readonly db: PrismaService) {}

  async getEmpresaId(actorId: number): Promise<number> {
    const actor = await this.db.usuario.findUnique({
      where: { id: actorId }, select: { empresaId: true, activo: true, rol: true },
    });
    if (!actor?.activo || actor.rol !== 'ADMIN' || !actor.empresaId) {
      throw new ForbiddenException('ADMIN activo con empresa asignada requerido.');
    }
    return actor.empresaId;
  }

  async read(section: AdminDashboardSection, s: DashboardScope): Promise<unknown> {
    const id = s.empresaId;
    const range = periodo(s);
    const due = { gte: s.now, lt: new Date(s.now.getTime() + 7 * 86400000) };
    const debt = { empresaId: id, estado: { in: [...carteraActiva] }, saldoPendiente: { gt: 0 } };
    switch (section) {
      case 'finanzas': {
        const [paid, pending, unapplied] = await Promise.all([
          this.db.pago.aggregate({ where: { empresaId: id, estado: 'VERIFICADO', verificadoEn: range },
            _sum: { monto: true }, _count: { _all: true } }),
          this.db.pago.count({ where: { empresaId: id, estado: 'PENDIENTE' } }),
          // Disponible por pago requiere considerar aplicaciones activas;
          // la cifra de pagos verificados NO se interpreta como saldo libre.
          this.db.pago.count({ where: { empresaId: id, estado: 'VERIFICADO',
            aplicaciones: { none: { estado: 'ACTIVA' } } } }),
        ]);
        return { cobrosVerificados: money(paid._sum.monto), numeroCobros: paid._count._all,
          pagosPorVerificar: pending, pagosVerificadosSinAplicaciones: unapplied,
          nota: 'Cobros según fecha de verificación; incluyen anticipos, no son ventas.' };
      }
      case 'cartera': {
        const [balance, overdue, next, drafts] = await Promise.all([
          this.db.cuentaPorCobrar.aggregate({ where: debt, _sum: { saldoPendiente: true }, _count: { _all: true } }),
          this.db.cuentaPorCobrar.aggregate({ where: { ...debt, fechaVencimiento: { lt: s.now } },
            _sum: { saldoPendiente: true }, _count: { _all: true } }),
          this.db.cuentaPorCobrar.aggregate({ where: { ...debt, fechaVencimiento: due },
            _sum: { saldoPendiente: true }, _count: { _all: true } }),
          this.db.creditoPlanPago.count({ where: { empresaId: id, estado: 'BORRADOR' } }),
        ]);
        return { pendiente: money(balance._sum.saldoPendiente), cuentasAbiertas: balance._count._all,
          vencido: money(overdue._sum.saldoPendiente), cuentasVencidas: overdue._count._all,
          porVencer7Dias: money(next._sum.saldoPendiente), vencimientos7Dias: next._count._all,
          planesSinActivar: drafts };
      }
      case 'pedidos': {
        const [period, validation, backlog] = await Promise.all([
          this.db.pedido.aggregate({ where: { empresaId: id, creadoEn: range,
            estado: { not: 'CANCELADO' } }, _sum: { total: true }, _count: { _all: true } }),
          this.db.pedido.count({ where: { empresaId: id, estado: 'PENDIENTE_VALIDACION' } }),
          this.db.pedido.count({ where: { empresaId: id, estado: { in: ['CONFIRMADO','EN_PREPARACION','PARCIALMENTE_DESPACHADO'] } } }),
        ]);
        return { pedidosPeriodo: period._count._all, valorNetoPedidos: money(period._sum.total),
          porValidar: validation, pendientesDeSalida: backlog };
      }
      case 'inventario': {
        const [warehouses, stock, exhausted] = await Promise.all([
          this.db.bodega.count({ where: { empresaId: id, activo: true } }),
          this.db.stockBodega.aggregate({ where: { bodega: { empresaId: id } },
            _sum: { cantidadReal: true, cantidadReservada: true, cantidadDisponible: true } }),
          this.db.stockBodega.count({ where: { bodega: { empresaId: id, activo: true },
            cantidadDisponible: { lte: 0 } } }),
        ]);
        return { bodegasActivas: warehouses, unidadesFisicas: stock._sum.cantidadReal ?? 0,
          unidadesReservadas: stock._sum.cantidadReservada ?? 0,
          unidadesDisponibles: stock._sum.cantidadDisponible ?? 0, referenciasAgotadas: exhausted };
      }
      case 'logistica': {
        const [dispatch, shipments, delivered, issues] = await Promise.all([
          this.db.ordenDespacho.count({ where: { pedido: { empresaId: id },
            estado: { in: ['PENDIENTE','PREPARANDO','PREPARADA','PARCIALMENTE_DESPACHADA'] } } }),
          this.db.envio.count({ where: { empresaId: id, estado: { in: ['EN_RUTA','INCIDENCIA'] } } }),
          this.db.entrega.count({ where: { pedido: { empresaId: id }, estado: 'ENTREGADA',
            entregadoEn: range } }),
          this.db.envioIncidencia.count({ where: { envio: { empresaId: id },
            estado: { in: ['ABIERTA','EN_ATENCION'] } } }),
        ]);
        return { despachosAbiertos: dispatch, enviosEnRutaOIncidencia: shipments,
          entregasPeriodo: delivered, incidenciasAbiertas: issues };
      }
      case 'abastecimiento': {
        const [requests, transfers] = await Promise.all([
          this.db.requisicion.count({ where: { empresaId: id, estado: 'SOLICITADA' } }),
          this.db.transferenciaBodega.count({ where: { bodegaOrigen: { empresaId: id },
            estado: { in: ['EN_TRANSITO','RECIBIDA_PARCIAL'] } } }),
        ]);
        return { requisicionesPorAprobar: requests, transferenciasEnTransito: transfers };
      }
      case 'clientes': {
        // Cliente es legacy y no tiene empresaId: no consultar el catálogo global.
        const [all, period] = await Promise.all([
          this.db.$queryRaw<{ total: bigint }[]>`
            SELECT count(DISTINCT "clienteId") AS total
            FROM "Pedido" WHERE "empresaId" = ${id}
          `,
          this.db.$queryRaw<{ total: bigint }[]>`
            SELECT count(DISTINCT "clienteId") AS total
            FROM "Pedido" WHERE "empresaId" = ${id}
              AND "creadoEn" >= ${s.desde} AND "creadoEn" < ${s.hasta}
          `,
        ]);
        return { clientesConPedidos: Number(all[0]?.total ?? 0),
          clientesConPedidosPeriodo: Number(period[0]?.total ?? 0),
          nota: 'Clientes con pedidos de la empresa; no total global de registros.' };
      }
      case 'facturacion': {
        const [draft, ready, issued] = await Promise.all([
          this.db.factura.count({ where: { empresaId: id, estado: 'BORRADOR' } }),
          this.db.factura.count({ where: { empresaId: id, estado: 'LISTA_EMISION' } }),
          this.db.factura.aggregate({ where: { empresaId: id, estado: 'EMITIDA', emitidaEn: range },
            _sum: { total: true }, _count: { _all: true } }),
        ]);
        return { borradores: draft, listasEmision: ready,
          emitidasPeriodo: issued._count._all, montoEmitido: money(issued._sum.total) };
      }
      case 'pagosPorVerificar': {
        const [total, items] = await Promise.all([
          this.db.pago.count({ where: { empresaId: id, estado: 'PENDIENTE' } }),
          this.db.pago.findMany({ where: { empresaId: id, estado: 'PENDIENTE' },
            select: { id: true, clienteId: true, pedidoId: true, monto: true, moneda: true,
              fechaPago: true, referencia: true }, orderBy: { fechaPago: 'asc' }, take: s.limit }),
        ]);
        return { total, items: items.map(x => ({ ...x, monto: money(x.monto), fechaPago: date(x.fechaPago) })) };
      }
      case 'creditosPorAprobar': {
        const [total, items] = await Promise.all([
          this.db.solicitudCredito.count({ where: { empresaId: id, estado: { in: ['PENDIENTE','EN_REVISION'] } } }),
          this.db.solicitudCredito.findMany({ where: { empresaId: id, estado: { in: ['PENDIENTE','EN_REVISION'] } },
            select: { id: true, numero: true, clienteId: true, pedidoId: true, estado: true,
              montoSolicitado: true, solicitadaEn: true }, orderBy: { solicitadaEn: 'asc' }, take: s.limit }),
        ]);
        return { total, items: items.map(x => ({ ...x, montoSolicitado: money(x.montoSolicitado), solicitadaEn: date(x.solicitadaEn) })) };
      }
      case 'cuotasVencidas': {
        const where = { ...debt, fechaVencimiento: { lt: s.now } };
        const [total, amount, items] = await Promise.all([
          this.db.cuentaPorCobrar.count({ where }),
          this.db.cuentaPorCobrar.aggregate({ where, _sum: { saldoPendiente: true } }),
          this.db.cuentaPorCobrar.findMany({ where, orderBy: { fechaVencimiento: 'asc' }, take: s.limit,
            select: { id: true, creditoId: true, pedidoId: true, numeroDocumento: true,
              fechaVencimiento: true, saldoPendiente: true } }),
        ]);
        return { total, monto: money(amount._sum.saldoPendiente),
          items: items.map(x => ({ ...x, saldoPendiente: money(x.saldoPendiente), fechaVencimiento: date(x.fechaVencimiento) })) };
      }
      case 'despachosFallidos': {
        const where = { ordenDespacho: { pedido: { empresaId: id } }, estado: 'FALLIDA' as const };
        const [total, items] = await Promise.all([
          this.db.operacionDespacho.count({ where }),
          this.db.operacionDespacho.findMany({ where, orderBy: { actualizadoEn: 'desc' }, take: s.limit,
            select: { id: true, ordenDespachoId: true, tipo: true, intentos: true, actualizadoEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, actualizadoEn: date(x.actualizadoEn) })) };
      }
      case 'incidenciasTransporte': {
        const where: Prisma.EnvioIncidenciaWhereInput = { envio: { empresaId: id }, estado: { in: ['ABIERTA','EN_ATENCION'] } };
        const [total, items] = await Promise.all([
          this.db.envioIncidencia.count({ where }),
          this.db.envioIncidencia.findMany({ where, orderBy: { reportadaEn: 'desc' }, take: s.limit,
            select: { id: true, envioId: true, tipo: true, severidad: true, estado: true, reportadaEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, reportadaEn: date(x.reportadaEn) })) };
      }
      case 'requisicionesPorAprobar': {
        const where = { empresaId: id, estado: 'SOLICITADA' as const };
        const [total, items] = await Promise.all([
          this.db.requisicion.count({ where }),
          this.db.requisicion.findMany({ where, orderBy: { solicitadaEn: 'asc' }, take: s.limit,
            select: { id: true, bodegaDestinoId: true, solicitanteId: true, solicitadaEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, solicitadaEn: date(x.solicitadaEn) })) };
      }
      case 'proximosCobros': {
        const where = { ...debt, fechaVencimiento: due };
        const [total, sum, items] = await Promise.all([
          this.db.cuentaPorCobrar.count({ where }),
          this.db.cuentaPorCobrar.aggregate({ where, _sum: { saldoPendiente: true } }),
          this.db.cuentaPorCobrar.findMany({ where, orderBy: { fechaVencimiento: 'asc' }, take: s.limit,
            select: { id: true, creditoId: true, clienteId: true, fechaVencimiento: true, saldoPendiente: true } }),
        ]);
        return { total, monto: money(sum._sum.saldoPendiente),
          items: items.map(x => ({ ...x, saldoPendiente: money(x.saldoPendiente), fechaVencimiento: date(x.fechaVencimiento) })) };
      }
      case 'pedidosPendientes': {
        const where: Prisma.PedidoWhereInput = { empresaId: id, estado: { in: ['PENDIENTE_VALIDACION','CONFIRMADO','EN_PREPARACION','PARCIALMENTE_DESPACHADO'] } };
        const [total, items] = await Promise.all([
          this.db.pedido.count({ where }),
          this.db.pedido.findMany({ where, orderBy: { creadoEn: 'asc' }, take: s.limit,
            select: { id: true, numero: true, clienteId: true, estado: true, total: true, creadoEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, total: money(x.total), creadoEn: date(x.creadoEn) })) };
      }
      case 'salidasProgramadas': {
        const where: Prisma.EnvioWhereInput = { empresaId: id, estado: { in: ['PROGRAMADO','ASIGNADO','CARGADO'] },
          salidaProgramadaEn: { gte: s.now, lt: new Date(s.now.getTime() + 7 * 86400000) } };
        const [total, items] = await Promise.all([
          this.db.envio.count({ where }),
          this.db.envio.findMany({ where, orderBy: { salidaProgramadaEn: 'asc' }, take: s.limit,
            select: { id: true, numero: true, estado: true, vehiculoId: true, conductorId: true, salidaProgramadaEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, salidaProgramadaEn: date(x.salidaProgramadaEn) })) };
      }
      case 'transferenciasPorRecibir': {
        const where: Prisma.TransferenciaBodegaWhereInput = { bodegaOrigen: { empresaId: id }, estado: { in: ['EN_TRANSITO','RECIBIDA_PARCIAL'] } };
        const [total, items] = await Promise.all([
          this.db.transferenciaBodega.count({ where }),
          this.db.transferenciaBodega.findMany({ where, orderBy: { enviadaEn: 'asc' }, take: s.limit,
            select: { id: true, estado: true, bodegaOrigenId: true, bodegaDestinoId: true, enviadaEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, enviadaEn: date(x.enviadaEn) })) };
      }
      case 'despachosPorEstado': {
        const states = await this.db.ordenDespacho.groupBy({
          by: ['estado'], where: { pedido: { empresaId: id }, creadoEn: range }, _count: { _all: true },
        });
        return states.map(x => ({ estado: x.estado, cantidad: x._count._all }));
      }
      case 'carteraAntiguedad': {
        const balances = await this.db.cuentaPorCobrar.groupBy({
          by: ['fechaVencimiento'], where: debt, _sum: { saldoPendiente: true },
        });
        const buckets = [
          { rango: 'VIGENTE', monto: new Prisma.Decimal(0) },
          { rango: '1-30', monto: new Prisma.Decimal(0) },
          { rango: '31-60', monto: new Prisma.Decimal(0) },
          { rango: '61-90', monto: new Prisma.Decimal(0) },
          { rango: '90+', monto: new Prisma.Decimal(0) },
        ];
        for (const row of balances) {
          const days = Math.floor((s.now.getTime() - row.fechaVencimiento.getTime()) / 86400000);
          const index = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
          buckets[index].monto = buckets[index].monto.add(row._sum.saldoPendiente ?? 0);
        }
        return buckets.map(x => ({ rango: x.rango, monto: money(x.monto) }));
      }
      case 'cobrosDiarios': {
        const rows = await this.db.$queryRaw<{ dia: string; monto: string; cantidad: bigint }[]>`
          SELECT to_char("verificadoEn" AT TIME ZONE 'America/Guatemala','YYYY-MM-DD') AS dia,
                 COALESCE(sum("monto"),0)::text AS monto,
                 count(*) AS cantidad
          FROM "Pago"
          WHERE "empresaId" = ${id} AND "estado" = 'VERIFICADO'
            AND "verificadoEn" >= ${s.desde} AND "verificadoEn" < ${s.hasta}
          GROUP BY 1 ORDER BY 1
        `;
        return rows.map(x => ({ dia: x.dia, monto: money(x.monto), cantidad: Number(x.cantidad) }));
      }
      case 'pedidosDiarios': {
        const rows = await this.db.$queryRaw<{ dia: string; monto: string; cantidad: bigint }[]>`
          SELECT to_char("creadoEn" AT TIME ZONE 'America/Guatemala','YYYY-MM-DD') AS dia,
                 COALESCE(sum("total"),0)::text AS monto, count(*) AS cantidad
          FROM "Pedido"
          WHERE "empresaId" = ${id} AND "estado" <> 'CANCELADO'
            AND "creadoEn" >= ${s.desde} AND "creadoEn" < ${s.hasta}
          GROUP BY 1 ORDER BY 1
        `;
        return rows.map(x => ({ dia: x.dia, monto: money(x.monto), cantidad: Number(x.cantidad) }));
      }
      case 'ultimosPedidos': {
        const rows = await this.db.pedido.findMany({ where: { empresaId: id }, take: s.limit,
          orderBy: { actualizadoEn: 'desc' },
          select: { id: true, numero: true, estado: true, clienteId: true, total: true, actualizadoEn: true } });
        return rows.map(x => ({ ...x, total: money(x.total), actualizadoEn: date(x.actualizadoEn) }));
      }
      case 'ultimosPagos': {
        const rows = await this.db.pago.findMany({ where: { empresaId: id }, take: s.limit,
          orderBy: { fechaPago: 'desc' },
          select: { id: true, estado: true, pedidoId: true, clienteId: true, monto: true, fechaPago: true } });
        return rows.map(x => ({ ...x, monto: money(x.monto), fechaPago: date(x.fechaPago) }));
      }
      case 'ultimosEnvios': {
        const rows = await this.db.envio.findMany({ where: { empresaId: id }, take: s.limit,
          orderBy: { actualizadoEn: 'desc' },
          select: { id: true, numero: true, estado: true, conductorId: true, actualizadoEn: true } });
        return rows.map(x => ({ ...x, actualizadoEn: date(x.actualizadoEn) }));
      }
      case 'enviosEnRuta': {
        const where: Prisma.EnvioWhereInput = { empresaId: id, estado: { in: ['EN_RUTA','INCIDENCIA'] } };
        const [total, items] = await Promise.all([
          this.db.envio.count({ where }),
          this.db.envio.findMany({ where, take: s.limit, orderBy: { salidaEn: 'desc' },
            select: { id: true, numero: true, estado: true, conductorId: true,
              vehiculoId: true, responsableId: true, salidaEn: true } }),
        ]);
        return { total, items: items.map(x => ({ ...x, salidaEn: date(x.salidaEn) })) };
      }
      case 'personalEnCampo': {
        const where = { estado: 'ACTIVA' as const, usuario: { empresaId: id, activo: true } };
        const lastFresh = new Date(s.now.getTime() - 10 * 60000);
        const [total, stale, items] = await Promise.all([
          this.db.sesionTrackingUsuario.count({ where }),
          this.db.sesionTrackingUsuario.count({ where: { ...where, ultimoHeartbeatEn: { lt: lastFresh } } }),
          this.db.sesionTrackingUsuario.findMany({ where, take: s.limit,
            orderBy: { ultimoHeartbeatEn: 'desc' },
            select: { id: true, usuarioId: true, ultimoHeartbeatEn: true,
              usuario: { select: { nombre: true, rol: true } },
              ubicacionActual: { select: { latitud: true, longitud: true, capturadoEn: true } } } }),
        ]);
        return { sesionesActivas: total, sinHeartbeat10Min: stale, items: items.map(x => ({
          id: x.id, usuarioId: x.usuarioId, nombre: x.usuario.nombre, rol: x.usuario.rol,
          ultimoHeartbeatEn: date(x.ultimoHeartbeatEn),
          posicion: x.ubicacionActual
            ? { latitud: Number(x.ubicacionActual.latitud), longitud: Number(x.ubicacionActual.longitud),
                capturadoEn: date(x.ubicacionActual.capturadoEn) }
            : null,
        })) };
      }
      default:
        throw new Error('Sección de dashboard no implementada.');
    }
  }
}
