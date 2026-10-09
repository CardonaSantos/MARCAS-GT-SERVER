import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProspectWorkflowStartDto, ProspectWorkflowFinishDto, ProspectWorkflowCancelDto } from './prospect-workflow.dto';

describe('Prospect workflow DTO', () => {
  it('validates start location and rejects fake owner field', async () => {
    const dto = plainToInstance(ProspectWorkflowStartDto, {
      nombreCompleto: 'Ana', departamentoId: 1, municipioId: 2,
    });
    expect(await validate(dto)).toEqual([]);
    const bad = plainToInstance(ProspectWorkflowStartDto, { departamentoId: 0, municipioId: -1 });
    expect((await validate(bad)).length).toBeGreaterThan(0);
  });
  it('allows optional GPS at zero and rejects invalid positions', async () => {
    const valid = plainToInstance(ProspectWorkflowFinishDto, {
      tipoCliente: 'Boutique', latitud: 0, longitud: -91.7,
    });
    expect(await validate(valid)).toEqual([]);
    const invalid = plainToInstance(ProspectWorkflowFinishDto, { latitud: 120, longitud: 181 });
    expect((await validate(invalid)).length).toBe(2);
  });
  it('requires a string for cancellation reason', async () => {
    expect((await validate(plainToInstance(ProspectWorkflowCancelDto, { motivo: 'No interesado' }))).length).toBe(0);
    expect((await validate(plainToInstance(ProspectWorkflowCancelDto, { motivo: 32 }))).length).toBeGreaterThan(0);
  });
});
