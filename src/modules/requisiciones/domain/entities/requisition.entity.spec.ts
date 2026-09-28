import { Requisition } from './requisition.entity';

describe('Requisition', () => {
  const create = () => Requisition.create({
    empresaId: 1,
    bodegaDestinoId: 1,
    proveedorId: 2,
    solicitanteId: 3,
    detalles: [{ productoId: 10, cantidadSolicitada: 5, cantidadRecibida: 0, costoUnitarioEstimado: '20.0000' }],
  });

  it('transiciona BORRADOR -> SOLICITADA -> APROBADA', () => {
    const entity = create();
    entity.request();
    expect(entity.estado).toBe('SOLICITADA');
    entity.approve();
    expect(entity.estado).toBe('APROBADA');
    expect(entity.version).toBe(2);
  });

  it('no permite solicitar sin detalles', () => {
    const entity = Requisition.create({ empresaId: 1, bodegaDestinoId: 1, solicitanteId: 3, detalles: [] });
    expect(() => entity.request()).toThrow('al menos un producto');
  });

  it('rechaza productos duplicados', () => {
    expect(() => Requisition.create({
      empresaId: 1, bodegaDestinoId: 1, solicitanteId: 3,
      detalles: [
        { productoId: 10, cantidadSolicitada: 1 },
        { productoId: 10, cantidadSolicitada: 2 },
      ],
    })).toThrow('no puede repetirse');
  });

  it('solo permite recepción sobre APROBADA/PARCIAL', () => {
    const entity = create();
    expect(() => entity.assertReceivable()).toThrow();
    entity.request();
    entity.approve();
    expect(() => entity.assertReceivable()).not.toThrow();
  });
});
