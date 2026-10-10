import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProspectHistoryQueryDto } from './prospect-history-query.dto';

describe('ProspectHistoryQueryDto', () => {
  it('converts pagination and validates the server filters', async () => {
    const query = plainToInstance(ProspectHistoryQueryDto, {
      page: '2', limit: '25', search: '  Ana López ',
      departamentoId: '13', municipioId: '72', vendedorId: '4',
      estado: 'FINALIZADO', tipoCliente: 'Boutique',
      convertido: 'false', sortBy: 'inicio', sortDir: 'asc',
    });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      page: 2, limit: 25, search: 'Ana López',
      departamentoId: 13, municipioId: 72, vendedorId: 4,
      convertido: 'false', sortBy: 'inicio', sortDir: 'asc',
    });
  });
  it('supplies deterministic first-page defaults', async () => {
    const query = plainToInstance(ProspectHistoryQueryDto, {});
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({ page: 1, limit: 20, sortBy: 'creadoEn', sortDir: 'desc' });
  });
  it.each([{ page: '0' }, { limit: '101' }, { estado: 'NO_EXISTE' },
    { convertido: 'all' }, { sortBy: 'telefono' }, { sortDir: 'random' },
    { vendedorId: '-1' }, { departamentoId: 'abc' }])(
    'rejects invalid parameter %j', async (values) => {
      const query = plainToInstance(ProspectHistoryQueryDto, values);
      expect((await validate(query)).length).toBeGreaterThan(0);
    },
  );
});
