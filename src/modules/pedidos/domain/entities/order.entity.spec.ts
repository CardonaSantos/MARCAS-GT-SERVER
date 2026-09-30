import { Pedido } from './order.entity';

describe('Pedido', () => {
  it('calcula montos y conserva snapshots comerciales', () => {
    const order = Pedido.create({
      empresaId: 1,
      clienteId: 10,
      vendedorId: 7,
      condicionPago: 'PREPAGO',
      detalles: [
        { productoId: 100, cantidadSolicitada: 2, precioUnitario: '25.00', descuento: '5.00' },
        { productoId: 200, cantidadSolicitada: 1, precioUnitario: '10.00', descuento: '0.00' },
      ],
    });
    expect(order.subtotal).toBe('60.00');
    expect(order.descuentoTotal).toBe('5.00');
    expect(order.total).toBe('55.00');
    expect(order.estado).toBe('BORRADOR');
  });

  it('pasa a PENDIENTE_VALIDACION con líneas válidas', () => {
    const order = Pedido.create({
      empresaId: 1,
      clienteId: 10,
      vendedorId: 7,
      condicionPago: 'PREPAGO',
      detalles: [{ productoId: 100, cantidadSolicitada: 1, precioUnitario: '25.00' }],
    });
    order.requestValidation();
    expect(order.estado).toBe('PENDIENTE_VALIDACION');
    expect(order.version).toBe(1);
    expect(order.validacionSolicitadaEn).not.toBeNull();
  });
});
