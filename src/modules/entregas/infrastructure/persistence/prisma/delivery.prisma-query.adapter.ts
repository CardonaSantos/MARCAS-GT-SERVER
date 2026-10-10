import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  DeliveryDirectoryEntry,
  DeliveryDirectoryPort,
  DeliveryQueryPort,
  DeliveryReadScope,
} from '../../../application/ports/delivery-query.port';

const terminal = ['PARCIAL', 'ENTREGADA', 'RECHAZADA', 'NO_ENTREGADA', 'CANCELADA'];

function scopeWhere(scope: DeliveryReadScope): any {
  return {
    pedido: {
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    },
    ...(scope.responsableId
      ? { envioDespacho: { envio: { responsableId: scope.responsableId } } }
      : {}),
  };
}

function kmDistance(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(x)));
}

function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

@Injectable()
export class DeliveryPrismaQueryAdapter implements DeliveryQueryPort, DeliveryDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private async rawList(where: any, skip?: number, take?: number, orderBy: any = { creadoEn: 'desc' }) {
    return this.prisma.entrega.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        cliente: { include: { ubicacion: true } },
        registradoPor: { select: { id: true, nombre: true, correo: true, rol: true } },
        pedido: {
          include: {
            vendedor: { select: { id: true, nombre: true, correo: true, rol: true } },
            pagos: { select: { monto: true, estado: true } },
          },
        },
        ordenDespacho: { include: { bodega: true } },
        envioDespacho: {
          include: {
            envio: {
              include: {
                transportista: true,
                vehiculo: true,
                conductor: true,
                responsable: { select: { id: true, nombre: true, correo: true, rol: true } },
              },
            },
            cargas: true,
          },
        },
        detalles: { include: { producto: true, pedidoDetalle: true, ordenDespachoDetalle: true } },
        evidencias: true,
        eventos: { orderBy: { creadoEn: 'desc' }, take: 5, include: { usuario: { select: { id: true, nombre: true, correo: true, rol: true } } } },
        facturas: { include: { factura: true } },
      },
    });
  }

  private enrich(row: any, scope: DeliveryReadScope) {
    const invoices = (row.facturas ?? []).map((link: any) => link.factura);
    const activeInvoice = invoices.find((invoice: any) =>
      ['BORRADOR', 'LISTA_EMISION', 'EMITIDA'].includes(invoice.estado),
    ) ?? null;
    const loaded = row.envioDespacho?.cargas?.reduce((a: number, x: any) => a + x.cantidadCargada, 0) ?? 0;
    const delivered = row.detalles.reduce((a: number, x: any) => a + x.cantidadEntregada, 0);
    const rejected = row.detalles.reduce((a: number, x: any) => a + x.cantidadRechazada, 0);
    const destLat = row.envioDespacho?.latitudDestino == null ? null : Number(row.envioDespacho.latitudDestino);
    const destLng = row.envioDespacho?.longitudDestino == null ? null : Number(row.envioDespacho.longitudDestino);
    const lat = row.latitud == null ? null : Number(row.latitud);
    const lng = row.longitud == null ? null : Number(row.longitud);
    const distance = lat != null && lng != null && destLat != null && destLng != null
      ? kmDistance(lat, lng, destLat, destLng)
      : null;
    const duration = row.iniciadaEn && row.finalizadaEn
      ? Math.round(((row.finalizadaEn.getTime() - row.iniciadaEn.getTime()) / 3600000) * 100) / 100
      : null;
    const warnings: any[] = [];
    const canOperate = ['ADMIN', 'BODEGA', 'REPARTIDOR'].includes(scope.rol);
    if (terminal.includes(row.estado) && !row.evidencias.length) warnings.push({ codigo: 'SIN_EVIDENCIA', nivel: 'ADVERTENCIA', mensaje: 'La entrega finalizó sin evidencia adjunta.' });
    if (['ENTREGADA', 'PARCIAL'].includes(row.estado) && !row.evidencias.some((x: any) => x.tipo === 'FIRMA')) warnings.push({ codigo: 'SIN_FIRMA', nivel: 'INFO', mensaje: 'No hay firma registrada.' });
    if (lat == null || lng == null) warnings.push({ codigo: 'SIN_GPS', nivel: 'ADVERTENCIA', mensaje: 'No hay ubicación final registrada.' });
    if (distance != null && distance > 500) warnings.push({ codigo: 'FUERA_RADIO_DESTINO', nivel: 'ADVERTENCIA', mensaje: `Registrada a ${distance} m del destino planificado.` });
    if (row.pedido.condicionPago === 'CONTRAENTREGA' && row.pedido.estadoPago !== 'PAGADO') warnings.push({ codigo: 'CONTRAENTREGA_PENDIENTE_COBRO', nivel: 'CRITICO', mensaje: 'Pedido contraentrega sin pago completo registrado.' });
    if (['ENTREGADA', 'PARCIAL'].includes(row.estado) && !activeInvoice) warnings.push({ codigo: 'ENTREGA_SIN_FACTURAR', nivel: 'INFO', mensaje: 'Entrega disponible para facturación.' });

    return {
      id: row.id,
      estado: row.estado,
      version: row.version,
      pedido: {
        id: row.pedido.id,
        numero: row.pedido.numero ?? `PED-${String(row.pedido.id).padStart(6, '0')}`,
        estado: row.pedido.estado,
        condicionPago: row.pedido.condicionPago,
        estadoPago: row.pedido.estadoPago,
        total: row.pedido.total.toString(),
        vendedor: row.pedido.vendedor,
      },
      cliente: {
        id: row.cliente.id,
        nombre: row.cliente.nombre,
        apellido: row.cliente.apellido,
        nombreCompleto: [row.cliente.nombre, row.cliente.apellido].filter(Boolean).join(' '),
        telefono: row.cliente.telefono,
        correo: row.cliente.correo,
        direccion: row.cliente.direccion,
      },
      despacho: {
        id: row.ordenDespacho.id,
        numero: row.ordenDespacho.numero ?? `DES-${String(row.ordenDespacho.id).padStart(6, '0')}`,
        estado: row.ordenDespacho.estado,
        bodega: row.ordenDespacho.bodega,
      },
      transporte: row.envioDespacho ? {
        envioDespachoId: row.envioDespacho.id,
        secuencia: row.envioDespacho.secuencia,
        paradaEstado: row.envioDespacho.estado,
        destino: {
          destinatario: row.envioDespacho.destinatario,
          telefono: row.envioDespacho.telefonoDestino,
          direccion: row.envioDespacho.direccionDestino,
          latitud: destLat,
          longitud: destLng,
        },
        envio: {
          id: row.envioDespacho.envio.id,
          numero: row.envioDespacho.envio.numero,
          estado: row.envioDespacho.envio.estado,
          modalidad: row.envioDespacho.envio.modalidad,
          salidaProgramadaEn: row.envioDespacho.envio.salidaProgramadaEn,
          entregaEstimadaEn: row.envioDespacho.envio.entregaEstimadaEn,
          salidaEn: row.envioDespacho.envio.salidaEn,
        },
        transportista: row.envioDespacho.envio.transportista,
        vehiculo: row.envioDespacho.envio.vehiculo,
        conductor: row.envioDespacho.envio.conductor,
        responsable: row.envioDespacho.envio.responsable,
      } : null,
      registradoPor: row.registradoPor,
      receptor: { nombre: row.receptorNombre, documento: row.receptorDocumento },
      resultado: {
        unidadesCargadas: loaded,
        unidadesEntregadas: delivered,
        unidadesRechazadas: rejected,
        unidadesSinResolver: Math.max(0, loaded - delivered - rejected),
        porcentajeAceptacion: loaded ? Math.round((delivered / loaded) * 10000) / 100 : 0,
      },
      ubicacion: {
        entrega: lat == null || lng == null ? null : { latitud: lat, longitud: lng },
        destino: destLat == null || destLng == null ? null : { latitud: destLat, longitud: destLng },
        distanciaDestinoMetros: distance,
        dentroRadioEsperado: distance == null ? null : distance <= 500,
      },
      evidencias: {
        total: row.evidencias.length,
        tieneFirma: row.evidencias.some((x: any) => x.tipo === 'FIRMA'),
        fotos: row.evidencias.filter((x: any) => x.tipo === 'FOTO').length,
        documentos: row.evidencias.filter((x: any) => x.tipo === 'DOCUMENTO').length,
        items: row.evidencias,
      },
      tiempos: {
        creadoEn: row.creadoEn,
        iniciadaEn: row.iniciadaEn,
        entregadoEn: row.entregadoEn,
        finalizadaEn: row.finalizadaEn,
        actualizadoEn: row.actualizadoEn,
        duracionHoras: duration,
      },
      motivoNoEntrega: row.motivoNoEntrega,
      detalleNoEntrega: row.detalleNoEntrega,
      observaciones: row.observaciones,
      factura: activeInvoice,
      facturas: invoices,
      detalles: row.detalles.map((x: any) => {
        const load = row.envioDespacho?.cargas?.find((c: any) => c.ordenDespachoDetalleId === x.ordenDespachoDetalleId);
        return {
          id: x.id,
          producto: { id: x.producto.id, codigo: x.producto.codigoProducto, nombre: x.producto.nombre },
          pedidoDetalleId: x.pedidoDetalleId,
          ordenDespachoDetalleId: x.ordenDespachoDetalleId,
          solicitado: x.pedidoDetalle.cantidadSolicitada,
          despachadoAcumulado: x.pedidoDetalle.cantidadDespachada,
          entregadoAcumulado: x.pedidoDetalle.cantidadEntregada,
          cargadoIntento: load?.cantidadCargada ?? 0,
          entregadoIntento: x.cantidadEntregada,
          rechazadoIntento: x.cantidadRechazada,
          motivoRechazo: x.motivoRechazo,
          pendientePedido: Math.max(0, x.pedidoDetalle.cantidadSolicitada - x.pedidoDetalle.cantidadEntregada),
        };
      }),
      eventosRecientes: row.eventos,
      acciones: {
        puedeIniciar: canOperate && row.estado === 'PENDIENTE',
        puedeEditarResultado:
          canOperate && ['PENDIENTE', 'EN_RUTA'].includes(row.estado),
        puedeAgregarEvidencia:
          canOperate && ['PENDIENTE', 'EN_RUTA'].includes(row.estado),
        puedeEliminarEvidencia:
          canOperate && ['PENDIENTE', 'EN_RUTA'].includes(row.estado),
        puedeFinalizar: canOperate && row.estado === 'EN_RUTA',
        puedeAgregarObservacion: canOperate,
      },
      advertencias: warnings,
    };
  }

  async list(filters: any) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const where: any = {
      ...scopeWhere(filters.scope),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.pedidoId ? { pedidoId: Number(filters.pedidoId) } : {}),
      ...(filters.ordenDespachoId ? { ordenDespachoId: Number(filters.ordenDespachoId) } : {}),
      ...(filters.envioDespachoId ? { envioDespachoId: Number(filters.envioDespachoId) } : {}),
      ...(filters.clienteId ? { clienteId: Number(filters.clienteId) } : {}),
      ...(filters.registradoPorId ? { registradoPorId: Number(filters.registradoPorId) } : {}),
      ...(filters.motivoNoEntrega ? { motivoNoEntrega: filters.motivoNoEntrega } : {}),
      ...(filters.soloPendientes ? { estado: { in: ['PENDIENTE', 'EN_RUTA'] } } : {}),
      ...(filters.soloSinFactura ? { facturas: { none: { factura: { estado: { in: ['BORRADOR', 'LISTA_EMISION', 'EMITIDA'] } } } }, estado: { in: ['ENTREGADA', 'PARCIAL'] } } : {}),
      ...((filters.fechaDesde || filters.fechaHasta) ? { creadoEn: {
        ...(filters.fechaDesde ? { gte: new Date(filters.fechaDesde) } : {}),
        ...(filters.fechaHasta ? { lte: new Date(filters.fechaHasta) } : {}),
      }} : {}),
      ...(filters.search ? { OR: [
        { cliente: { nombre: { contains: filters.search, mode: 'insensitive' } } },
        { cliente: { apellido: { contains: filters.search, mode: 'insensitive' } } },
        { pedido: { numero: { contains: filters.search, mode: 'insensitive' } } },
        { ordenDespacho: { numero: { contains: filters.search, mode: 'insensitive' } } },
        { envioDespacho: { envio: { numero: { contains: filters.search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.entrega.count({ where }),
      this.rawList(where, (page - 1) * limit, limit, { [filters.sortBy || 'creadoEn']: filters.sortDir === 'asc' ? 'asc' : 'desc' }),
    ]);
    return { data: rows.map((x: any) => this.enrich(x, filters.scope)), meta: pageMeta(page, limit, total) };
  }

  async listCandidates(filters: any) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const where: any = {
      estado: 'EN_RUTA',
      envio: {
        empresaId: filters.scope.empresaId,
        estado: { in: ['EN_RUTA', 'INCIDENCIA', 'ENTREGADO_PARCIAL'] },
        ...(filters.scope.responsableId ? { responsableId: filters.scope.responsableId } : {}),
      },
      ordenDespacho: {
        pedido: {
          ...(filters.scope.vendedorId ? { vendedorId: filters.scope.vendedorId } : {}),
          ...(filters.clienteId ? { clienteId: Number(filters.clienteId) } : {}),
        },
      },
      OR: [
        { entrega: null },
        { entrega: { estado: { in: ['PENDIENTE', 'EN_RUTA'] } } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.envioDespacho.count({ where }),
      this.prisma.envioDespacho.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ envio: { salidaProgramadaEn: 'asc' } }, { secuencia: 'asc' }],
        include: {
          cliente: true,
          envio: { include: { responsable: { select: { id: true, nombre: true, correo: true, rol: true } }, transportista: true, vehiculo: true, conductor: true } },
          ordenDespacho: { include: { bodega: true, pedido: { include: { vendedor: { select: { id: true, nombre: true, correo: true, rol: true } } } } } },
          cargas: { include: { producto: true } },
          entrega: true,
        },
      }),
    ]);
    return {
      data: rows.map((x: any) => ({
        envioDespachoId: x.id,
        secuencia: x.secuencia,
        paradaEstado: x.estado,
        envio: x.envio,
        cliente: x.cliente,
        pedido: x.ordenDespacho.pedido,
        despacho: { id: x.ordenDespacho.id, numero: x.ordenDespacho.numero, bodega: x.ordenDespacho.bodega },
        destino: { destinatario: x.destinatario, telefono: x.telefonoDestino, direccion: x.direccionDestino, latitud: x.latitudDestino == null ? null : Number(x.latitudDestino), longitud: x.longitudDestino == null ? null : Number(x.longitudDestino) },
        carga: x.cargas.map((c: any) => ({ id: c.id, producto: { id: c.producto.id, codigo: c.producto.codigoProducto, nombre: c.producto.nombre }, cantidadPlanificada: c.cantidadPlanificada, cantidadCargada: c.cantidadCargada })),
        unidadesCargadas: x.cargas.reduce((a: number, c: any) => a + c.cantidadCargada, 0),
        entregaActual: x.entrega,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async get(id: number, scope: DeliveryReadScope) {
    const rows = await this.rawList({ id, ...scopeWhere(scope) }, 0, 1);
    return rows[0] ? this.enrich(rows[0], scope) : null;
  }

  async listEvents(id: number, scope: DeliveryReadScope, filters: any) {
    const delivery = await this.prisma.entrega.findFirst({ where: { id, ...scopeWhere(scope) }, select: { id: true } });
    if (!delivery) return { data: [], meta: pageMeta(1, Number(filters.limit) || 20, 0) };
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const where: any = {
      entregaId: id,
      ...(filters.tipo ? { tipo: filters.tipo } : {}),
      ...(filters.usuarioId ? { usuarioId: Number(filters.usuarioId) } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.entregaEvento.count({ where }),
      this.prisma.entregaEvento.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { creadoEn: 'desc' },
        include: { usuario: { select: { id: true, nombre: true, correo: true, rol: true } } },
      }),
    ]);
    return { data, meta: pageMeta(page, limit, total) };
  }

  async listEvidence(id: number, scope: DeliveryReadScope) {
    const delivery = await this.prisma.entrega.findFirst({ where: { id, ...scopeWhere(scope) }, select: { id: true } });
    if (!delivery) return [];
    return this.prisma.entregaEvidencia.findMany({ where: { entregaId: id }, orderBy: { creadoEn: 'desc' } });
  }

  async getSummary(scope: DeliveryReadScope, filters: any = {}) {
    const where: any = {
      ...scopeWhere(scope),
      ...((filters.fechaDesde || filters.fechaHasta) ? { creadoEn: {
        ...(filters.fechaDesde ? { gte: new Date(filters.fechaDesde) } : {}),
        ...(filters.fechaHasta ? { lte: new Date(filters.fechaHasta) } : {}),
      }} : {}),
    };
    const rows = await this.rawList(where);
    const states = ['PENDIENTE','EN_RUTA','PARCIAL','ENTREGADA','RECHAZADA','NO_ENTREGADA','CANCELADA'];
    const porEstado = Object.fromEntries(states.map((s) => [s, rows.filter((x: any) => x.estado === s).length]));
    const enriched = rows.map((x: any) => this.enrich(x, scope));
    const units = enriched.reduce((a: any, x: any) => ({
      cargadas: a.cargadas + x.resultado.unidadesCargadas,
      entregadas: a.entregadas + x.resultado.unidadesEntregadas,
      rechazadas: a.rechazadas + x.resultado.unidadesRechazadas,
    }), { cargadas: 0, entregadas: 0, rechazadas: 0 });
    const done = rows.filter((x: any) => terminal.includes(x.estado));
    const success = rows.filter((x: any) => ['ENTREGADA','PARCIAL'].includes(x.estado));
    const withGps = rows.filter((x: any) => x.latitud != null && x.longitud != null).length;
    const withSignature = rows.filter((x: any) => x.evidencias.some((e: any) => e.tipo === 'FIRMA')).length;
    const durations = enriched.map((x: any) => x.tiempos.duracionHoras).filter((x: any) => x != null);
    return {
      total: rows.length,
      porEstado,
      activas: (porEstado.PENDIENTE || 0) + (porEstado.EN_RUTA || 0),
      finalizadas: done.length,
      efectividad: {
        completas: porEstado.ENTREGADA || 0,
        parciales: porEstado.PARCIAL || 0,
        rechazadas: porEstado.RECHAZADA || 0,
        noEntregadas: porEstado.NO_ENTREGADA || 0,
        porcentajeExito: done.length ? Math.round((success.length / done.length) * 10000) / 100 : 0,
      },
      unidades: {
        ...units,
        pendientes: Math.max(0, units.cargadas - units.entregadas - units.rechazadas),
        porcentajeAceptacion: units.cargadas ? Math.round((units.entregadas / units.cargadas) * 10000) / 100 : 0,
      },
      evidencia: {
        conFirma: withSignature,
        conGps: withGps,
        coberturaFirma: done.length ? Math.round((withSignature / done.length) * 10000) / 100 : 0,
        coberturaGps: done.length ? Math.round((withGps / done.length) * 10000) / 100 : 0,
      },
      tiempos: {
        promedioEntregaHoras: durations.length ? Math.round((durations.reduce((a: number,b: number)=>a+b,0)/durations.length)*100)/100 : null,
      },
      facturacion: {
        listasParaFacturar: rows.filter((x: any) => ['ENTREGADA','PARCIAL'].includes(x.estado) && !(x.facturas ?? []).some((link: any) => ['BORRADOR','LISTA_EMISION','EMITIDA'].includes(link.factura.estado))).length,
        facturadas: rows.filter((x: any) => (x.facturas ?? []).some((link: any) => ['BORRADOR','LISTA_EMISION','EMITIDA'].includes(link.factura.estado))).length,
      },
    };
  }

  async getOperationalReport(scope: DeliveryReadScope, filters: any = {}) {
    const now = new Date();
    const from = filters.fechaDesde ? new Date(filters.fechaDesde) : new Date(now.getTime() - 30 * 86400000);
    const to = filters.fechaHasta ? new Date(filters.fechaHasta) : now;
    const rows = await this.rawList({ ...scopeWhere(scope), creadoEn: { gte: from, lte: to } });
    const enriched = rows.map((x: any) => this.enrich(x, scope));
    const done = rows.filter((x: any) => terminal.includes(x.estado));
    const byReason = new Map<string, number>();
    rows.filter((x: any) => x.motivoNoEntrega).forEach((x: any) => byReason.set(x.motivoNoEntrega, (byReason.get(x.motivoNoEntrega) || 0) + 1));
    const byDay = new Map<string, any>();
    rows.forEach((x: any) => {
      const key = x.creadoEn.toISOString().slice(0,10);
      const item = byDay.get(key) || { fecha: key, intentos: 0, completas: 0, parciales: 0, fallidas: 0, unidadesEntregadas: 0 };
      item.intentos++;
      if (x.estado === 'ENTREGADA') item.completas++;
      if (x.estado === 'PARCIAL') item.parciales++;
      if (['RECHAZADA','NO_ENTREGADA'].includes(x.estado)) item.fallidas++;
      item.unidadesEntregadas += x.detalles.reduce((a: number,d: any)=>a+d.cantidadEntregada,0);
      byDay.set(key,item);
    });
    const repartidores = new Map<number, any>();
    enriched.forEach((x: any) => {
      const u = x.transporte?.responsable;
      if (!u) return;
      const item = repartidores.get(u.id) || { usuario: u, intentos: 0, exitosas: 0, unidadesEntregadas: 0, duraciones: [], fueraRadio: 0 };
      item.intentos++;
      if (['ENTREGADA','PARCIAL'].includes(x.estado)) item.exitosas++;
      item.unidadesEntregadas += x.resultado.unidadesEntregadas;
      if (x.tiempos.duracionHoras != null) item.duraciones.push(x.tiempos.duracionHoras);
      if (x.ubicacion.dentroRadioEsperado === false) item.fueraRadio++;
      repartidores.set(u.id,item);
    });
    const punctual = rows.filter((x: any) => x.finalizadaEn && x.envioDespacho?.envio?.entregaEstimadaEn);
    return {
      rango: { desde: from, hasta: to, dias: Math.max(1, Math.ceil((to.getTime()-from.getTime())/86400000)) },
      efectividad: {
        intentos: done.length,
        completas: rows.filter((x:any)=>x.estado==='ENTREGADA').length,
        parciales: rows.filter((x:any)=>x.estado==='PARCIAL').length,
        rechazadas: rows.filter((x:any)=>x.estado==='RECHAZADA').length,
        noEntregadas: rows.filter((x:any)=>x.estado==='NO_ENTREGADA').length,
        tasaExito: done.length ? Math.round((rows.filter((x:any)=>['ENTREGADA','PARCIAL'].includes(x.estado)).length/done.length)*10000)/100 : 0,
      },
      motivosNoEntrega: [...byReason.entries()].map(([motivo,cantidad])=>({motivo,cantidad})).sort((a,b)=>b.cantidad-a.cantidad),
      tendenciaDiaria: [...byDay.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)),
      puntualidad: {
        evaluadas: punctual.length,
        aTiempo: punctual.filter((x:any)=>x.finalizadaEn<=x.envioDespacho.envio.entregaEstimadaEn).length,
        tarde: punctual.filter((x:any)=>x.finalizadaEn>x.envioDespacho.envio.entregaEstimadaEn).length,
        sinEstimacion: done.length-punctual.length,
      },
      evidencia: {
        conFirma: rows.filter((x:any)=>x.evidencias.some((e:any)=>e.tipo==='FIRMA')).length,
        conFoto: rows.filter((x:any)=>x.evidencias.some((e:any)=>e.tipo==='FOTO')).length,
        conGps: rows.filter((x:any)=>x.latitud!=null&&x.longitud!=null).length,
        sinEvidencia: done.filter((x:any)=>!x.evidencias.length).length,
      },
      repartidores: [...repartidores.values()].map((x:any)=>({
        usuario:x.usuario,
        intentos:x.intentos,
        exitosas:x.exitosas,
        tasaExito:x.intentos?Math.round((x.exitosas/x.intentos)*10000)/100:0,
        unidadesEntregadas:x.unidadesEntregadas,
        horasPromedio:x.duraciones.length?Math.round((x.duraciones.reduce((a:number,b:number)=>a+b,0)/x.duraciones.length)*100)/100:null,
        fueraRadio:x.fueraRadio,
      })).sort((a:any,b:any)=>b.intentos-a.intentos),
    };
  }

  async findById(id: number): Promise<DeliveryDirectoryEntry | null> {
    const row = await this.prisma.entrega.findUnique({
      where: { id },
      include: { pedido: { select: { empresaId: true } }, detalles: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      estado: row.estado as any,
      empresaId: row.pedido.empresaId,
      pedidoId: row.pedidoId,
      clienteId: row.clienteId,
      ordenDespachoId: row.ordenDespachoId,
      envioDespachoId: row.envioDespachoId,
      entregadoEn: row.entregadoEn,
      finalizadaEn: row.finalizadaEn,
      detalles: row.detalles.map((x: any)=>({
        id:x.id,pedidoDetalleId:x.pedidoDetalleId,productoId:x.productoId,
        cantidadEntregada:x.cantidadEntregada,cantidadRechazada:x.cantidadRechazada,
      })),
    };
  }

  async findBillableById(id: number) {
    const result = await this.findById(id);
    return result && ['ENTREGADA','PARCIAL'].includes(result.estado) ? result : null;
  }
}
