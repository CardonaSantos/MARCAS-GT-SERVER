import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ProductCatalogAccessGuard } from './catalog-access.guard';

describe('ProductCatalogAccessGuard', () => {
  const userFind = jest.fn();
  const guard = new ProductCatalogAccessGuard({
    usuario: { findUnique: userFind },
  } as unknown as PrismaService);

  const request = (userId: unknown) => ({ user: { userId } }) as any;
  const ctx = (req: any) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

  beforeEach(() => userFind.mockReset());

  it('revalida ADMIN y empresa en BD', async () => {
    const req = request(6);
    userFind.mockResolvedValue({ id: 6, rol: 'ADMIN', activo: true, empresaId: 15 });
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.catalogEmpresaId).toBe(15);
    expect(userFind).toHaveBeenCalledWith({
      where: { id: 6 },
      select: { id: true, rol: true, activo: true, empresaId: true },
    });
  });

  it('rechaza JWT faltante o inválido', async () => {
    await expect(guard.canActivate(ctx(request(undefined)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userFind).not.toHaveBeenCalled();
  });

  it.each([
    { id: 5, rol: 'VENDEDOR', activo: true, empresaId: 1 },
    { id: 5, rol: 'BODEGA', activo: true, empresaId: 1 },
    { id: 5, rol: 'ADMIN', activo: true, empresaId: null },
  ])('no permite rol ajeno o sin empresa: %j', async (actor) => {
    userFind.mockResolvedValue(actor);
    await expect(guard.canActivate(ctx(request(5)))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza cuentas inactivas', async () => {
    userFind.mockResolvedValue({ id: 5, rol: 'ADMIN', activo: false, empresaId: 1 });
    await expect(guard.canActivate(ctx(request(5)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
