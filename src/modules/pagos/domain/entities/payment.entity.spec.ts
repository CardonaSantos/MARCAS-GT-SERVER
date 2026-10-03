import { Pago } from './payment.entity';

describe('Pago', () => {
  it('crea un pago PENDIENTE', () => {
    const payment = Pago.create({
      empresaId: 1,
      clienteId: 2,
      pedidoId: 3,
      bancoId: null,
      registradoPorId: 4,
      metodo: 'EFECTIVO',
      moneda: 'gtq',
      monto: '500',
      claveIdempotencia: 'PAY-TEST-001',
    });

    expect(payment.estado).toBe('PENDIENTE');
    expect(payment.moneda).toBe('GTQ');
    expect(payment.monto).toBe('500.00');
    expect(payment.version).toBe(0);
  });

  it('verifica un pago y aumenta versión', () => {
    const payment = Pago.create({
      empresaId: 1,
      clienteId: 2,
      registradoPorId: 4,
      metodo: 'EFECTIVO',
      monto: '100.00',
      claveIdempotencia: 'PAY-TEST-002',
    });

    payment.verify(8, new Date('2026-10-03T12:00:00Z'));

    expect(payment.estado).toBe('VERIFICADO');
    expect(payment.verificadoPorId).toBe(8);
    expect(payment.version).toBe(1);
  });

  it('exige banco y referencia para transferencia', () => {
    expect(() =>
      Pago.create({
        empresaId: 1,
        clienteId: 2,
        registradoPorId: 4,
        metodo: 'TRANSFERENCIA_BANCO',
        monto: '100.00',
        claveIdempotencia: 'PAY-TEST-003',
      }),
    ).toThrow();
  });

  it('solo puede anular un pago verificado', () => {
    const payment = Pago.create({
      empresaId: 1,
      clienteId: 2,
      registradoPorId: 4,
      metodo: 'EFECTIVO',
      monto: '100.00',
      claveIdempotencia: 'PAY-TEST-004',
    });

    expect(() => payment.void('Corrección', 8)).toThrow();

    payment.verify(8);
    payment.void('Corrección', 8);

    expect(payment.estado).toBe('ANULADO');
    expect(payment.version).toBe(2);
  });
});
