import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaClient, Rol, Usuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';

const PUBLIC_USER_SELECT = Prisma.validator<Prisma.UsuarioSelect>()({
  id: true, nombre: true, correo: true, rol: true, empresaId: true,
  activo: true, creadoEn: true, actualizadoEn: true,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Uso exclusivo de autenticación; nunca exponer su hash en controladores. */
  findByEmail(email: string): Promise<Usuario | null> {
    return this.prisma.usuario.findFirst({
      where: { correo: { equals: email.trim(), mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
  }

  findAuthUserById(id: number) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, correo: true, rol: true, empresaId: true, activo: true },
    });
  }

  async findSelectables(actorId: number) {
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: actorId },
      select: { activo: true, empresaId: true },
    });
    if (!actor?.activo || !actor.empresaId) throw new UnauthorizedException('Sesión sin empresa activa.');
    return this.prisma.usuario.findMany({
      where: { empresaId: actor.empresaId, activo: true },
      select: PUBLIC_USER_SELECT,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
  }

  private async requireAdmin(actorId: number) {
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: actorId },
      select: { id: true, rol: true, activo: true, empresaId: true },
    });
    if (!actor?.activo) throw new UnauthorizedException('Sesión inactiva.');
    if (actor.rol !== Rol.ADMIN || !actor.empresaId) {
      throw new ForbiddenException('Solo el administrador de una empresa puede gestionar usuarios.');
    }
    return { id: actor.id, empresaId: actor.empresaId };
  }

  private async target(id: number, empresaId: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('ID de usuario inválido.');
    const user = await this.prisma.usuario.findFirst({
      where: { id, empresaId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado en esta empresa.');
    return user;
  }

  private translateWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('El correo electrónico ya está registrado.');
    }
    throw error;
  }

  async createUser(dto: CreateUserDto, actorId: number) {
    const actor = await this.requireAdmin(actorId);
    if (dto.empresaId !== undefined && dto.empresaId !== actor.empresaId) {
      throw new ForbiddenException('La empresa del registro no corresponde a tu sesión.');
    }
    try {
      const password = await bcrypt.hash(dto.contrasena, 12);
      return await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre.trim(), correo: dto.correo.trim().toLowerCase(),
          contrasena: password, rol: dto.rol, empresaId: actor.empresaId,
        },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  /** Array acotado por tenant para componentes de selección existentes. */
  async findAllUsers(actorId: number) {
    const actor = await this.requireAdmin(actorId);
    return this.prisma.usuario.findMany({
      where: { empresaId: actor.empresaId },
      select: PUBLIC_USER_SELECT,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
  }

  async directory(actorId: number, q: UserDirectoryQueryDto) {
    const actor = await this.requireAdmin(actorId);
    const terms = q.search?.split(/\s+/).filter(Boolean).slice(0, 8) ?? [];
    const where: Prisma.UsuarioWhereInput = {
      empresaId: actor.empresaId,
      ...(q.rol ? { rol: q.rol } : {}),
      ...(q.activo ? { activo: q.activo === 'true' } : {}),
      ...(terms.length ? { AND: terms.map((term) => ({
        OR: [
          { nombre: { contains: term, mode: 'insensitive' as const } },
          { correo: { contains: term, mode: 'insensitive' as const } },
        ],
      })) } : {}),
    };
    const [total, rows, active, admins, companyTotal] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where, select: PUBLIC_USER_SELECT, skip: (q.page - 1) * q.limit,
        take: q.limit, orderBy: [{ [q.sortBy]: q.sortDir }, { id: 'asc' }],
      }),
      this.prisma.usuario.count({ where: { empresaId: actor.empresaId, activo: true } }),
      this.prisma.usuario.count({ where: { empresaId: actor.empresaId, activo: true, rol: Rol.ADMIN } }),
      this.prisma.usuario.count({ where: { empresaId: actor.empresaId } }),
    ]);
    return {
      data: rows,
      meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
      summary: { total: companyTotal, active, inactive: companyTotal - active, admins },
    };
  }

  async findOneUser(id: number, actorId: number) {
    const actor = await this.requireAdmin(actorId);
    return this.target(id, actor.empresaId);
  }

  async updateOneUser(id: number, dto: UpdateUserDto, actorId: number) {
    const actor = await this.requireAdmin(actorId);
    await this.target(id, actor.empresaId);
    if (!Object.keys(dto).length) throw new BadRequestException('Indica un cambio para el usuario.');
    if (id === actor.id && (dto.activo === false || (dto.rol && dto.rol !== Rol.ADMIN))) {
      throw new ConflictException('No puedes desactivar ni quitar el rol ADMIN de tu propia cuenta.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.usuario.findFirst({
          where: { id, empresaId: actor.empresaId },
          select: { id: true, rol: true, activo: true },
        });
        if (!previous) throw new NotFoundException('Usuario no encontrado en esta empresa.');
        const demotingLastAdmin = previous.activo && previous.rol === Rol.ADMIN &&
          (dto.activo === false || (dto.rol && dto.rol !== Rol.ADMIN));
        if (demotingLastAdmin) {
          const activeAdmins = await tx.usuario.count({
            where: { empresaId: actor.empresaId, rol: Rol.ADMIN, activo: true },
          });
          if (activeAdmins <= 1) throw new ConflictException('Debe existir al menos un administrador activo.');
        }
        return tx.usuario.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
            ...(dto.correo !== undefined ? { correo: dto.correo.trim().toLowerCase() } : {}),
            ...(dto.rol !== undefined ? { rol: dto.rol } : {}),
            ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
          },
          select: PUBLIC_USER_SELECT,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async changeUserPassword(id: number, dto: ChangePasswordDto, actorId: number) {
    const actor = await this.requireAdmin(actorId);
    await this.target(id, actor.empresaId);
    const admin = await this.prisma.usuario.findUnique({
      where: { id: actor.id },
      select: { contrasena: true },
    });
    const correct = admin && await bcrypt.compare(dto.adminPassword, admin.contrasena);
    if (!correct) throw new ForbiddenException('La contraseña del administrador es incorrecta.');
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.usuario.update({ where: { id }, data: { contrasena: hashed } });
    return { message: 'Contraseña actualizada correctamente.' };
  }

  /** DELETE legacy se transforma en desactivación, sin cascadas ni pérdida de trazabilidad. */
  removeOneUser(id: number, actorId: number) {
    return this.updateOneUser(id, { activo: false }, actorId);
  }
}
