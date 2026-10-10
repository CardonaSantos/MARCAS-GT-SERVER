import { Prisma } from '@prisma/client';
import { OrderDeliveryGateAdapter } from './order-delivery-gate.adapter';

describe('Bloqueo de entrega MIXTO sin anticipo', () => {
  it('rechaza unidades entregadas cuando el anticipo no está aplicado', async () => {
    const tx = {
      pedidoEvento: { findFirst: jest.fn().mockResolvedValue(null) },
      pedido: { findUnique: jest.fn().mockResolvedValue({
        id: 3, empresaId: 5, condicionPago: 'MIXTO', estado: 'CONFIRMADO', version: 0,
      }) },
      cuentaPorCobrar: { findUnique: jest.fn().mockResolvedValue({
        empresaId: 5, estado: 'PENDIENTE', saldoPendiente: new Prisma.Decimal('200.00'),
      }) },
      pedidoDetalle: { findFirst: jest.fn() },
    };
    const db = { $transaction: jest.fn().mockImplementation(async (run: any) => run(tx)) };
    const adapter = new OrderDeliveryGateAdapter(db as any);
    await expect(adapter.registerDelivery({
      pedidoId: 3,
      entregaId: 10,
      actorId: 8,
      empresaId: 5,
      resultado: 'ENTREGADA',
      detalles: [{ entregaDetalleId: 1, pedidoDetalleId: 2, cantidadEntregada: 1 }],
    })).rejects.toMatchObject({ code: 'ORDER_VALIDATION_ERROR' });
    expect(tx.pedidoDetalle.findFirst).not.toHaveBeenCalled();
  });
});
