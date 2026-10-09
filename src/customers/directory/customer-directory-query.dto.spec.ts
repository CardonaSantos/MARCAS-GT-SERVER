import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerDirectoryQueryDto } from './customer-directory-query.dto';

describe('CustomerDirectoryQueryDto', () => {
  it('converts pagination and preserves server filters', async () => {
    const dto = plainToInstance(CustomerDirectoryQueryDto, {
      page: '2', limit: '15', search: '  Ana Maria  ',
      departamentoId: '3', municipioId: '7',
      intereses: 'Ropa de Mujer,Ropa de Hombre',
      sortBy: 'creadoEn', sortDir: 'desc',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      page: 2, limit: 15, search: 'Ana Maria',
      departamentoId: 3, municipioId: 7,
      intereses: 'Ropa de Mujer,Ropa de Hombre',
      sortBy: 'creadoEn', sortDir: 'desc',
    });
  });
  it('defaults to first page and bounded 20 entries', async () => {
    const dto = plainToInstance(CustomerDirectoryQueryDto, {});
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc' });
  });
  it.each([{ page: '0' }, { limit: '101' }, { departamentoId: '-1' },
    { municipioId: 'abc' }, { sortBy: 'ventas' }, { sortDir: 'random' }])(
    'rejects invalid pagination/filter %p',
    async (values) => {
      const dto = plainToInstance(CustomerDirectoryQueryDto, values);
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
