import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn().mockResolvedValue(true) }));

describe('UsersService - administración segura', () => {
  const actor = { id: 1, activo: true, rol: Rol.ADMIN, empresaId: 7 };
  const user = { id: 2, nombre: 'Ana', correo: 'ana@test.gt', rol: Rol.VENDEDOR, empresaId: 7, activo: true };
  const usuario = {
    findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
    count: jest.fn(), create: jest.fn(), update: jest.fn(),
  };
  const prisma = {
    usuario,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)({ usuario }) : Promise.all(arg as Promise<unknown>[])),
  };
  const service = new UsersService(prisma as unknown as PrismaClient);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue(actor);
    usuario.findFirst.mockResolvedValue(user);
    usuario.findMany.mockResolvedValue([user]);
    usuario.count.mockResolvedValue(1);
    usuario.create.mockResolvedValue(user);
    usuario.update.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it('rechaza actor vendedor aunque use un token válido', async () => {
    usuario.findUnique.mockResolvedValueOnce({ ...actor, rol: Rol.VENDEDOR });
    await expect(service.findAllUsers(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nunca expone hash y filtra el tenant en el listado legacy', async () => {
    await service.findAllUsers(1);
    expect(usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { empresaId: 7 },
      select: expect.not.objectContaining({ contrasena: true }),
    }));
  });

  it('filtra y pagina en servidor y da totales', async () => {
    const dto = Object.assign(new UserDirectoryQueryDto(), { page: 2, limit: 10, search: 'Ana', rol: Rol.VENDEDOR });
    const page = await service.directory(1, dto);
    expect(page.meta).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    expect(usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10, where: expect.objectContaining({ empresaId: 7, rol: Rol.VENDEDOR }),
    }));
  });

  it('rechaza leer una cuenta de otra empresa', async () => {
    usuario.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOneUser(50, 1)).rejects.toThrow('Usuario no encontrado');
  });

  it('impide auto-desactivación o perder rol de administrador', async () => {
    await expect(service.updateOneUser(1, { activo: false }, 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateOneUser(1, { rol: Rol.VENDEDOR }, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza la desactivación del último administrador activo', async () => {
    usuario.findFirst.mockResolvedValue({ ...user, rol: Rol.ADMIN });
    await expect(service.removeOneUser(2, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('no permite usar empresaId de otro tenant en creación', async () => {
    await expect(service.createUser({
      nombre: 'Otro', correo: 'otro@correo.gt', contrasena: 'contrasena123', rol: Rol.VENDEDOR,
      empresaId: 99,
    }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(usuario.create).not.toHaveBeenCalled();
  });

  it('devuelve únicamente confirmación al cambiar contraseña', async () => {
    const result = await service.changeUserPassword(2, {
      adminPassword: 'secreto', newPassword: 'nueva-contrasena',
    }, 1);
    expect(result).toEqual({ message: 'Contraseña actualizada correctamente.' });
    expect(usuario.update).toHaveBeenCalledWith({
      where: { id: 2 }, data: { contrasena: 'hashed' },
    });
  });

  it('bloquea la contraseña incorrecta del administrador', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    await expect(service.changeUserPassword(2, {
      adminPassword: 'mala', newPassword: 'nueva-contrasena',
    }, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloquea sesiones inactivas', async () => {
    usuario.findUnique.mockResolvedValueOnce({ ...actor, activo: false });
    await expect(service.findAllUsers(1)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
