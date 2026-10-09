import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ComprobanteError } from '../../../domain/comprobante.errors';
import { DocumentoBorrador } from '../../../domain/comprobante.types';
import { ComprobanteSourcePort } from '../../../domain/ports/comprobante-source.port';

const PERSON = { id: true, nombre: true } as const;
const COMPANY = { id: true, nombre: true, direccion: true, telefono: true, pbx: true, email: true, website: true } as const;
const TERMINAL_DELIVERY = ['ENTREGADA', 'PARCIAL', 'RECHAZADA', 'NO_ENTREGADA'];

@Injectable()
export class ComprobanteSourcePrismaAdapter implements ComprobanteSourcePort {
  constructor(private readonly prisma: PrismaService) {}

  private company(empresaId: number) {
    return this.prisma.empresa.findUnique({
      where: { id: empresaId }, select: COMPANY,
    });
  }

  async salida(despachoId: number, operacionId: number, empresaId: number): Promise<DocumentoBorrador | null> {
    const operation = await this.prisma.operacionDespacho.findFirst({
      where: {
        id: operacionId, ordenDespachoId: despachoId,
        ordenDespacho: { pedido: { empresaId } },
      },
      include: {
        usuario: { select: PERSON },
        detalles: {
          orderBy: { id: 'asc' },
          include: {
            ordenDespachoDetalle: {
              include: { producto: { select: { id: true, codigoProducto: true, nombre: true } } },
            },
          },
        },
        ordenDespacho: {
          include: {
            bodega: { select: { id: true, codigo: true, nombre: true, direccion: true } },
            preparadoPor: { select: PERSON },
            creadoPor: { select: PERSON },
            pedido: {
              include: {
                cliente: {
                  select: { id: true, nombre: true, apellido: true, telefono: true, correo: true, direccion: true },
                },
                vendedor: { select: PERSON },
              },
            },
            envios: {
              include: {
                envio: {
                  include: {
                    transportista: true, vehiculo: true, conductor: true,
                    responsable: { select: PERSON },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!operation) return null;
    if (operation.tipo !== 'SALIDA_DESPACHO' || operation.estado !== 'APLICADA' ||
        !operation.aplicadaEn || !operation.detalles.length ||
        operation.detalles.some((line) => line.estado !== 'APLICADA' ||
          !line.movimientoInventarioId || line.cantidad <= 0)) {
      throw new ComprobanteError('NO_EMITIBLE',
        'La salida física no está aplicada completamente o carece de movimientos de inventario confirmados.');
    }

    const [empresa, movimientos] = await Promise.all([
      this.company(empresaId),
      this.prisma.movimientoInventario.findMany({
        where: { id: { in: operation.detalles.map((line) => line.movimientoInventarioId!) } },
        select: { id: true, bodegaId: true, productoId: true, cantidad: true, tipo: true },
      }),
    ]);
    if (!empresa) throw new ComprobanteError('NO_ENCONTRADO', 'Empresa inexistente.');
    const byMovement = new Map(movimientos.map((x) => [x.id, x]));
    for (const line of operation.detalles) {
      const movement = byMovement.get(line.movimientoInventarioId!);
      if (!movement || movement.tipo !== 'SALIDA_DESPACHO' ||
          movement.bodegaId !== operation.ordenDespacho.bodegaId ||
          movement.productoId !== line.ordenDespachoDetalle.productoId ||
          movement.cantidad !== line.cantidad) {
        throw new ComprobanteError('NO_EMITIBLE', 'El movimiento de inventario no coincide con la salida física.');
      }
    }

    const row = operation.ordenDespacho;
    const client = row.pedido.cliente;
    return {
      tipo: 'SALIDA_DESPACHO', referenciaId: operation.id,
      snapshot: {
        esquema: 'COMPROBANTES_OPERATIVOS_V1',
        clase: 'NOTA_SALIDA_BODEGA',
        advertencia: 'Comprobante operativo de salida; no es factura ni DTE.',
        empresa,
        documento: { despachoId, operacionId, numeroDespacho: row.numero, pedidoId: row.pedido.id,
          numeroPedido: row.pedido.numero, estadoOperacion: String(operation.estado) },
        cliente: { ...client, nombreCompleto: [client.nombre, client.apellido].filter(Boolean).join(' ') },
        bodega: row.bodega,
        operadores: { registradoPor: operation.usuario, preparadoPor: row.preparadoPor,
          creadoPor: row.creadoPor, vendedor: row.pedido.vendedor },
        fechas: { programadoEn: row.programadoEn, preparadaEn: row.preparadoEn,
          salidaRegistradaEn: operation.ocurridaEn, salidaConfirmadaEn: operation.aplicadaEn },
        transporte: row.envios.map((stop) => ({
          paradaId: stop.id, destino: { destinatario: stop.destinatario,
            direccion: stop.direccionDestino, telefono: stop.telefonoDestino },
          envio: { id: stop.envio.id, numero: stop.envio.numero, guia: stop.envio.guia,
            estado: stop.envio.estado },
          transportista: stop.envio.transportista?.nombre ?? null,
          conductor: stop.envio.conductor?.nombre ?? null,
          vehiculo: stop.envio.vehiculo ? { placa: stop.envio.vehiculo.placa,
            marca: stop.envio.vehiculo.marca, modelo: stop.envio.vehiculo.modelo } : null,
          responsable: stop.envio.responsable,
        })),
        lineas: operation.detalles.map((line) => ({
          operacionDetalleId: line.id,
          despachoDetalleId: line.ordenDespachoDetalleId,
          movimientoInventarioId: line.movimientoInventarioId,
          producto: { id: line.ordenDespachoDetalle.producto.id,
            codigo: line.ordenDespachoDetalle.producto.codigoProducto,
            nombre: line.ordenDespachoDetalle.producto.nombre },
          cantidad: line.cantidad,
          observaciones: line.ordenDespachoDetalle.observaciones,
        })),
        resumen: { productos: operation.detalles.length,
          unidadesSalidas: operation.detalles.reduce((sum, line) => sum + line.cantidad, 0) },
        observaciones: operation.observaciones,
      },
    };
  }

  async entrega(entregaId: number, empresaId: number): Promise<DocumentoBorrador | null> {
    const row = await this.prisma.entrega.findFirst({
      where: { id: entregaId, pedido: { empresaId } },
      include: {
        cliente: { select: { id: true, nombre: true, apellido: true, telefono: true, correo: true, direccion: true } },
        registradoPor: { select: PERSON },
        pedido: { include: { vendedor: { select: PERSON } } },
        ordenDespacho: { include: { bodega: { select: { id: true, codigo: true, nombre: true, direccion: true } } } },
        detalles: {
          orderBy: { id: 'asc' },
          include: { producto: { select: { id: true, codigoProducto: true, nombre: true } },
            pedidoDetalle: { select: { cantidadSolicitada: true, cantidadEntregada: true } } },
        },
        evidencias: { orderBy: { creadoEn: 'asc' } },
        eventos: {
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          include: { usuario: { select: PERSON } },
        },
        envioDespacho: {
          include: {
            cargas: true,
            envio: { include: { transportista: true, vehiculo: true, conductor: true, responsable: { select: PERSON } } },
          },
        },
      },
    });
    if (!row) return null;
    if (!TERMINAL_DELIVERY.includes(row.estado) || !row.finalizadaEn) {
      throw new ComprobanteError('NO_EMITIBLE', 'La entrega no ha finalizado; todavía no puede emitir una constancia.');
    }
    const empresa = await this.company(empresaId);
    if (!empresa) throw new ComprobanteError('NO_ENCONTRADO', 'Empresa inexistente.');
    const stop = row.envioDespacho;
    const client = row.cliente;
    const lineas = row.detalles.map((line) => {
      const cargado = stop?.cargas.find((x) => x.ordenDespachoDetalleId === line.ordenDespachoDetalleId);
      return {
        entregaDetalleId: line.id,
        producto: { id: line.producto.id, codigo: line.producto.codigoProducto, nombre: line.producto.nombre },
        solicitadoPedido: line.pedidoDetalle.cantidadSolicitada,
        cargadoIntento: cargado?.cantidadCargada ?? null,
        cantidadAceptada: line.cantidadEntregada, cantidadRechazada: line.cantidadRechazada,
        cantidadEntregadaAcumulada: line.pedidoDetalle.cantidadEntregada,
        motivoRechazo: line.motivoRechazo,
      };
    });
    const cierre = row.eventos.find((e) => TERMINAL_DELIVERY.includes(e.tipo));
    const accepted = lineas.reduce((sum, l) => sum + l.cantidadAceptada, 0);
    const rejected = lineas.reduce((sum, l) => sum + l.cantidadRechazada, 0);
    const loaded = stop ? stop.cargas.reduce((sum, c) => sum + c.cantidadCargada, 0) : null;
    return {
      tipo: 'ENTREGA', referenciaId: row.id,
      snapshot: {
        esquema: 'COMPROBANTES_OPERATIVOS_V1',
        clase: ['ENTREGADA', 'PARCIAL'].includes(row.estado) ? 'CONSTANCIA_ENTREGA' : 'CONSTANCIA_INTENTO_ENTREGA',
        advertencia: 'Documento operativo de recepcion o intento; no es factura ni DTE.',
        empresa,
        documento: { entregaId: row.id, estado: String(row.estado), despachoId: row.ordenDespachoId,
          numeroDespacho: row.ordenDespacho.numero, pedidoId: row.pedidoId, numeroPedido: row.pedido.numero },
        cliente: { ...client, nombreCompleto: [client.nombre, client.apellido].filter(Boolean).join(' ') },
        destino: stop ? { destinatario: stop.destinatario, telefono: stop.telefonoDestino,
          direccion: stop.direccionDestino, latitud: stop.latitudDestino, longitud: stop.longitudDestino } : null,
        bodegaOrigen: row.ordenDespacho.bodega,
        operadores: { registradoPor: row.registradoPor, vendedor: row.pedido.vendedor,
          finalizadoPor: cierre?.usuario ?? null,
          responsableEntrega: stop?.envio.responsable ?? null },
        transporte: stop ? { envioId: stop.envio.id, numero: stop.envio.numero, guia: stop.envio.guia,
          transportista: stop.envio.transportista?.nombre ?? null,
          conductor: stop.envio.conductor?.nombre ?? null,
          vehiculo: stop.envio.vehiculo ? { placa: stop.envio.vehiculo.placa,
            marca: stop.envio.vehiculo.marca, modelo: stop.envio.vehiculo.modelo } : null } : null,
        receptor: { nombre: row.receptorNombre, documento: row.receptorDocumento },
        fechas: { iniciadaEn: row.iniciadaEn, entregadoEn: row.entregadoEn, finalizadaEn: row.finalizadaEn },
        ubicacionCierre: row.latitud == null || row.longitud == null ? null :
          { latitud: row.latitud.toString(), longitud: row.longitud.toString() },
        lineas,
        resumen: { unidadesCargadas: loaded, unidadesAceptadas: accepted, unidadesRechazadas: rejected,
          unidadesNoResueltas: loaded === null ? null : Math.max(0, loaded - accepted - rejected) },
        evidencias: row.evidencias.map((e) => ({ id: e.id, tipo: String(e.tipo),
          key: e.key, url: e.url, descripcion: e.descripcion, creadoEn: e.creadoEn })),
        motivoNoEntrega: row.motivoNoEntrega, detalleNoEntrega: row.detalleNoEntrega,
        observaciones: row.observaciones,
      },
    };
  }
}
