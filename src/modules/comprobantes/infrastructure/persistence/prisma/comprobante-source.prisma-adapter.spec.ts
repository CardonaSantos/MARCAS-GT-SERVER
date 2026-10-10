import { ComprobanteSourcePrismaAdapter } from './comprobante-source.prisma-adapter';

const D = new Date('2026-10-08T17:00:00.000Z');

function mockDb() {
  return {
    operacionDespacho: { findFirst: jest.fn() },
    entrega: { findFirst: jest.fn() },
    empresa: { findUnique: jest.fn().mockResolvedValue({
      id: 1, nombre: 'Marcas GT', direccion: 'Jacaltenango', telefono: '55550000',
      pbx: null, email: 'info@marcas.gt', website: null,
    }) },
    movimientoInventario: { findMany: jest.fn() },
  };
}
function sourceOperation() {
  return {
    id: 12, ordenDespachoId: 7, tipo: 'SALIDA_DESPACHO', estado: 'APLICADA',
    ocurridaEn: D, aplicadaEn: D, observaciones: null,
    usuario: { id: 10, nombre: 'Bodeguero' },
    detalles: [
      { id: 22, ordenDespachoDetalleId: 33, cantidad: 3, estado: 'APLICADA',
        movimientoInventarioId: 900, ordenDespachoDetalle: {
          productoId: 44, observaciones: null,
          producto: { id: 44, codigoProducto: 'P-44', nombre: 'Producto' },
        } },
    ],
    ordenDespacho: {
      bodegaId: 5, numero: 'DSP-7', programadoEn: D, preparadoEn: D,
      bodega: { id: 5, codigo: 'CENTRAL', nombre: 'Bodega Central' },
      preparadoPor: { id: 9, nombre: 'Preparador' }, creadoPor: null,
      pedido: {
        id: 99, numero: 'PED-99', vendedor: { id: 4, nombre: 'Vendedor' },
        cliente: { id: 2, nombre: 'Cliente', apellido: 'Prueba', telefono: '555',
          correo: null, direccion: 'Guatemala' },
      },
      envios: [],
    },
  };
}
function delivery() {
  return {
    id: 8, estado: 'PARCIAL', finalizadaEn: D, iniciadaEn: D, entregadoEn: D,
    latitud: null, longitud: null, receptorNombre: 'Receptor', receptorDocumento: '123',
    motivoNoEntrega: null, detalleNoEntrega: null, observaciones: null,
    ordenDespachoId: 7, pedidoId: 99,
    cliente: { id: 2, nombre: 'Cliente', apellido: 'Prueba', telefono: '555',
      correo: null, direccion: 'Guatemala' },
    registradoPor: { id: 10, nombre: 'Operador' },
    pedido: { numero: 'PED-99', vendedor: { id: 4, nombre: 'Vendedor' } },
    ordenDespacho: { numero: 'DSP-7', bodega: { id: 5, codigo: 'CENTRAL', nombre: 'Bodega Central' } },
    detalles: [{
      id: 3, ordenDespachoDetalleId: 33, cantidadEntregada: 2,
      cantidadRechazada: 1, motivoRechazo: 'Dañado',
      producto: { id: 44, codigoProducto: 'P-44', nombre: 'Producto' },
      pedidoDetalle: { cantidadSolicitada: 5, cantidadEntregada: 2 },
    }],
    evidencias: [{ id: 90, tipo: 'FIRMA', key: 'safe/key', url: 'https://example.test/firma',
      descripcion: null, creadoEn: D }],
    eventos: [{ id: 1, tipo: 'ENTREGA_PARCIAL', usuario: { id: 11, nombre: 'Repartidor' } }],
    envioDespacho: { destinatario: 'Cliente', telefono: '555', direccionDestino: 'Guatemala',
      latitudDestino: null, longitudDestino: null, cargas: [{ ordenDespachoDetalleId: 33, cantidadCargada: 3 }],
      envio: { id: 5, numero: 'ENV-5', guia: null, transportista: null,
        conductor: null, vehiculo: null, responsable: { id: 11, nombre: 'Repartidor' } } },
  };
}

describe('ComprobanteSourcePrismaAdapter', () => {
  it('salida: solo la operacion solicitada y perteneciente al despacho/empresa', async () => {
    const db = mockDb();
    db.operacionDespacho.findFirst.mockResolvedValue(sourceOperation());
    db.movimientoInventario.findMany.mockResolvedValue([
      { id: 900, tipo: 'SALIDA_DESPACHO', bodegaId: 5, productoId: 44, cantidad: 3 },
    ]);
    const adapter = new ComprobanteSourcePrismaAdapter(db as any);
    const doc = await adapter.salida(7, 12, 1);
    expect(db.operacionDespacho.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12, ordenDespachoId: 7, ordenDespacho: { pedido: { empresaId: 1 } } },
    }));
    expect(doc?.tipo).toBe('SALIDA_DESPACHO');
    expect(doc?.snapshot.lineas).toEqual([expect.objectContaining({
      cantidad: 3, movimientoInventarioId: 900,
    })]);
  });

  it('no crea documento de salida cuando falta aplicar inventario', async () => {
    const db = mockDb();
    db.operacionDespacho.findFirst.mockResolvedValue({
      ...sourceOperation(), estado: 'APLICANDO',
    });
    const adapter = new ComprobanteSourcePrismaAdapter(db as any);
    await expect(adapter.salida(7, 12, 1)).rejects.toMatchObject({ code: 'NO_EMITIBLE' });
    expect(db.movimientoInventario.findMany).not.toHaveBeenCalled();
  });

  it('rechaza diferencias de cantidad/almacen en el movimiento', async () => {
    const db = mockDb();
    db.operacionDespacho.findFirst.mockResolvedValue(sourceOperation());
    db.movimientoInventario.findMany.mockResolvedValue([
      { id: 900, tipo: 'SALIDA_DESPACHO', bodegaId: 5, productoId: 44, cantidad: 2 },
    ]);
    const adapter = new ComprobanteSourcePrismaAdapter(db as any);
    await expect(adapter.salida(7, 12, 1)).rejects.toMatchObject({ code: 'NO_EMITIBLE' });
  });

  it('no emite constancia de entrega abierta', async () => {
    const db = mockDb();
    db.entrega.findFirst.mockResolvedValue({ ...delivery(), estado: 'EN_RUTA', finalizadaEn: null });
    const adapter = new ComprobanteSourcePrismaAdapter(db as any);
    await expect(adapter.entrega(8, 1)).rejects.toMatchObject({ code: 'NO_EMITIBLE' });
  });

  it('entrega parcial contiene las cantidades de este intento y firmante real', async () => {
    const db = mockDb();
    db.entrega.findFirst.mockResolvedValue(delivery());
    const adapter = new ComprobanteSourcePrismaAdapter(db as any);
    const doc = await adapter.entrega(8, 1);
    expect(doc?.snapshot.clase).toBe('CONSTANCIA_ENTREGA');
    expect(doc?.snapshot.operadores).toEqual(expect.objectContaining({
      finalizadoPor: { id: 11, nombre: 'Repartidor' },
    }));
    expect(doc?.snapshot.lineas).toEqual([expect.objectContaining({
      cargadoIntento: 3, cantidadAceptada: 2, cantidadRechazada: 1,
    })]);
    expect(doc?.snapshot.resumen).toEqual({
      unidadesCargadas: 3, unidadesAceptadas: 2, unidadesRechazadas: 1,
      unidadesNoResueltas: 0,
    });
  });

  it('rechazo completo es constancia de intento, no de recepcion', async () => {
    const db = mockDb();
    db.entrega.findFirst.mockResolvedValue({ ...delivery(), estado: 'RECHAZADA' });
    const doc = await new ComprobanteSourcePrismaAdapter(db as any).entrega(8, 1);
    expect(doc?.snapshot.clase).toBe('CONSTANCIA_INTENTO_ENTREGA');
  });

  it('scope de empresa y fuente inexistente no filtra datos ajenos', async () => {
    const db = mockDb();
    db.entrega.findFirst.mockResolvedValue(null);
    await expect(new ComprobanteSourcePrismaAdapter(db as any).entrega(8, 1))
      .resolves.toBeNull();
    expect(db.entrega.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8, pedido: { empresaId: 1 } },
    }));
  });
});
