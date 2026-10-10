import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductCatalogListQueryDto } from './catalog-query.dto';

describe('ProductCatalogListQueryDto', () => {
  it('aplica defaults y admite filtros normalizados', async () => {
    const dto = plainToInstance(ProductCatalogListQueryDto, {
      page: '2', limit: '15', search: '  camisa  ',
      categoriaId: '3', bodegaId: '8', conExistencia: 'false',
      precioMin: '0.00', precioMax: '125.50', sortBy: 'precio', sortDir: 'desc',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      page: 2, limit: 15, search: 'camisa',
      categoriaId: 3, bodegaId: 8, conExistencia: false,
      precioMin: 0, precioMax: 125.5, sortBy: 'precio', sortDir: 'desc',
    });
  });

  it('usa página 1, 20 registros y nombre asc por defecto', async () => {
    const dto = plainToInstance(ProductCatalogListQueryDto, {});
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc' });
  });

  it.each([
    { page: '0' },
    { limit: '101' },
    { limit: '0' },
    { conExistencia: 'maybe' },
    { precioMin: '-1' },
    { precioMax: '1.555' },
    { sortBy: 'cantidadDisponible' },
    { categoriaId: '0' },
  ])('rechaza parámetros inválidos: %j', async (query) => {
    const dto = plainToInstance(ProductCatalogListQueryDto, query);
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
