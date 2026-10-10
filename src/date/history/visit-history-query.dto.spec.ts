import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VisitHistoryQueryDto } from './visit-history-query.dto';

describe('VisitHistoryQueryDto', () => {
  it('defaults to the first chronological page', async () => {
    const q = plainToInstance(VisitHistoryQueryDto, {});
    expect(await validate(q)).toEqual([]);
    expect(q).toMatchObject({ page: 1, limit: 20, sortBy: 'inicio', sortDir: 'desc' });
  });
  it('transforms pagination, filters and search', async () => {
    const q = plainToInstance(VisitHistoryQueryDto, {
      page: '2', limit: '50', search: '  Rosa  ',
      estadoVisita: 'FINALIZADA', tipoVisita: 'PRESENCIAL',
      motivoVisita: 'SEGUIMIENTO', clienteId: '4', vendedorId: '2',
      departamentoId: '13', municipioId: '25',
      desde: '2026-10-01', hasta: '2026-10-08', sortBy: 'fin', sortDir: 'asc',
    });
    expect(await validate(q)).toEqual([]);
    expect(q).toMatchObject({ page: 2, limit: 50, search: 'Rosa',
      clienteId: 4, vendedorId: 2, sortBy: 'fin', sortDir: 'asc' });
  });
  it.each([{ page: '0' }, { limit: '101' }, { estadoVisita: 'CLOSED' },
    { motivoVisita: 'X' }, { tipoVisita: 'TELEFONO' },
    { sortBy: 'cliente' }, { sortDir: 'down' }, { hasta: '2026-14-01' },
    { desde: '2026-01-10T08:00:00.000Z' }, { vendedorId: '0' }])(
    'rejects invalid request %j', async (values) => {
      expect((await validate(plainToInstance(VisitHistoryQueryDto, values))).length).toBeGreaterThan(0);
    },
  );
});
