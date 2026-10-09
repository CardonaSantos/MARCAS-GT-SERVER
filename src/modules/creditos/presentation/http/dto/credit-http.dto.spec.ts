import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApproveCreditWithScheduleDto,
  CreditScheduleDto,
} from './credit-http.dto';

describe('DTO de aprobacion de credito con cuotas', () => {
  it('se importa e inicializa sin ReferenceError en runtime', async () => {
    const dto = plainToInstance(ApproveCreditWithScheduleDto, {
      montoAutorizado: '7500.00',
      plazoAutorizadoDias: 30,
      anticipoRequerido: '0.00',
      claveIdempotencia: 'aprobar-test-12345',
      plan: {
        frecuencia: 'MENSUAL',
        numeroCuotas: 3,
        primeraFechaVencimiento: '2026-11-10T00:00:00.000Z',
      },
    });
    expect(dto.plan).toBeInstanceOf(CreditScheduleDto);
    expect(dto.plan.primeraFechaVencimiento).toBeInstanceOf(Date);
    expect(await validate(dto)).toEqual([]);
  });
});
