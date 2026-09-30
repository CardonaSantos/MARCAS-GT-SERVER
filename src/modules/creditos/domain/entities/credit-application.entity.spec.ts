import { CreditApplication } from './credit-application.entity';

describe('CreditApplication', () => {
  it('crea expediente PENDIENTE y lo envía a revisión', () => {
    const app = CreditApplication.create({
      empresaId: 1,
      pedidoId: 2,
      clienteId: 1,
      solicitanteId: 7,
      montoSolicitado: '450.00',
      plazoDias: 30,
      anticipoPropuesto: '50.00',
    });
    expect(app.estado).toBe('PENDIENTE');
    app.submitForReview();
    expect(app.estado).toBe('EN_REVISION');
    expect(app.version).toBe(1);
  });

  it('cancela una solicitud abierta con motivo', () => {
    const app = CreditApplication.create({
      empresaId: 1,
      pedidoId: 2,
      clienteId: 1,
      solicitanteId: 7,
      montoSolicitado: '450.00',
      plazoDias: 30,
    });
    app.cancel('Cliente cambia forma de pago');
    expect(app.estado).toBe('CANCELADA');
    expect(app.motivoCancelacion).toBe('Cliente cambia forma de pago');
  });
});
