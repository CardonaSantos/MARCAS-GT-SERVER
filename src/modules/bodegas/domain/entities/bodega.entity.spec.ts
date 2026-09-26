import { Bodega } from './bodega.entity';
import {
  BodegaPrincipalCannotBeDeactivatedError,
  InvalidBodegaCodeError,
} from '../errors/bodega.errors';

const create = (overrides: Partial<Parameters<typeof Bodega.create>[0]> = {}) =>
  Bodega.create({
    empresaId: 1,
    codigo: 'central-01',
    nombre: 'Bodega Central',
    ...overrides,
  });

describe('Bodega', () => {
  it('normaliza el código al crear', () => {
    const bodega = create();
    expect(bodega.codigo).toBe('CENTRAL-01');
  });

  it('rechaza códigos inválidos', () => {
    expect(() => create({ codigo: 'central 01' })).toThrow(
      InvalidBodegaCodeError,
    );
  });

  it('no permite desactivar una bodega principal', () => {
    const bodega = create({ esPrincipal: true });
    expect(() => bodega.deactivate('Cierre operativo')).toThrow(
      BodegaPrincipalCannotBeDeactivatedError,
    );
  });

  it('limpia los datos de inactivación al reactivar', () => {
    const bodega = create();
    bodega.deactivate('Mantenimiento');
    bodega.activate();

    expect(bodega.activo).toBe(true);
    expect(bodega.motivoInactivacion).toBeNull();
    expect(bodega.inactivadaEn).toBeNull();
  });
});
