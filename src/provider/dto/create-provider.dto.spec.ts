import { validate } from 'class-validator';
import { CreateProviderDto } from './create-provider.dto';

describe('CreateProviderDto', () => {
  it('permite crear proveedores solo con nombre', async () => {
    const dto = new CreateProviderDto();
    dto.nombre = 'Proveedor de prueba';
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rechaza nombres vacíos', async () => {
    const dto = new CreateProviderDto();
    dto.nombre = '';
    const result = await validate(dto);
    expect(result.some((item) => item.property === 'nombre')).toBe(true);
  });

  it('permite contactos opcionales y rechaza correo inválido', async () => {
    const dto = new CreateProviderDto();
    dto.nombre = 'Proveedora';
    dto.correo = 'no-es-correo';
    const result = await validate(dto);
    expect(result.some((item) => item.property === 'correo')).toBe(true);
  });
});
