import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VisitCancelDto, VisitFinishDto, VisitStartDto } from './visit-workflow.dto';

describe('Visit workflow DTO', () => {
  it('requires an existing customer id, reason and visit type', async () => {
    const valid = plainToInstance(VisitStartDto, {
      clienteId: 12, motivoVisita: 'SEGUIMIENTO', tipoVisita: 'PRESENCIAL',
    });
    expect(await validate(valid)).toEqual([]);
    const bad = plainToInstance(VisitStartDto, { clienteId: 0 });
    expect((await validate(bad)).length).toBeGreaterThan(0);
  });
  it('validates observations and cancellation reason', async () => {
    expect(await validate(plainToInstance(VisitFinishDto, { observaciones: '' }))).toEqual([]);
    expect(await validate(plainToInstance(VisitCancelDto, { motivoCancelacion: 'Cliente ausente' }))).toEqual([]);
    expect((await validate(plainToInstance(VisitCancelDto, { motivoCancelacion: '' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(VisitFinishDto, { observaciones: 15 }))).length).toBeGreaterThan(0);
  });
});
