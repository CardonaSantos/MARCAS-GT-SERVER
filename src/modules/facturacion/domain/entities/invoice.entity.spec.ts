import { Invoice } from './invoice.entity';

function draft() {
  return Invoice.create({
    empresaId: 1,
    clienteId: 2,
    pedidoId: 3,
    creadoPorId: 4,
    condicionPago: 'CREDITO',
    moneda: 'GTQ',
    subtotal: '100.00',
    descuentoTotal: '10.00',
    impuestoTotal: '0.00',
    total: '90.00',
    detalles: [
      {
        productoId: 8,
        pedidoDetalleId: 9,
        entregaDetalleId: 10,
        descripcion: 'Producto',
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        cantidad: 2,
        precioUnitario: '50.00',
        precioBruto: '100.00',
        descuento: '10.00',
        impuestoTotal: '0.00',
        totalLinea: '90.00',
      },
    ],
  });
}

describe('Invoice', () => {
  it('crea un borrador consistente', () => {
    const invoice = draft();
    expect(invoice.estado).toBe('BORRADOR');
    expect(invoice.total).toBe('90.00');
  });

  it('permite descartar únicamente desde BORRADOR', () => {
    const invoice = draft();
    invoice.discard('Pedido corregido');
    expect(invoice.estado).toBe('DESCARTADA');
    expect(invoice.descartadaEn).toBeInstanceOf(Date);
    expect(() => invoice.markPrepared()).toThrow();
  });

  it('prepara un borrador y bloquea edición posterior', () => {
    const invoice = draft();
    invoice.markPrepared();
    expect(invoice.estado).toBe('LISTA_EMISION');
    expect(() => invoice.assertEditable()).toThrow();
  });

  it('rechaza totales inconsistentes', () => {
    expect(() =>
      Invoice.create({
        empresaId: 1,
        clienteId: 2,
        moneda: 'GTQ',
        subtotal: '100.00',
        descuentoTotal: '0.00',
        impuestoTotal: '0.00',
        total: '80.00',
        detalles: [
          {
            productoId: 1,
            pedidoDetalleId: 1,
            entregaDetalleId: 1,
            descripcion: 'Producto',
            bienOServicio: 'BIEN',
            unidadMedida: 'UN',
            cantidad: 1,
            precioUnitario: '100.00',
            precioBruto: '100.00',
            descuento: '0.00',
            impuestoTotal: '0.00',
            totalLinea: '100.00',
          },
        ],
      }),
    ).toThrow('totales generales');
  });
});
