import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { VisitCancelDto, VisitFinishDto, VisitStartDto } from './visit-workflow.dto';

const VISIT_SELECT = Prisma.validator<Prisma.VisitaSelect>()({
  id: true,
  inicio: true,
  fin: true,
  usuarioId: true,
  clienteId: true,
  estadoVisita: true,
  motivoVisita: true,
  tipoVisita: true,
  observaciones: true,
  creadoEn: true,
  actualizadoEn: true,
  cliente: {
    select: {
      id: true, nombre: true, apellido: true, telefono: true,
      correo: true, direccion: true,
      departamento: { select: { id: true, nombre: true } },
      municipio: { select: { id: true, nombre: true } },
    },
  },
  vendedor: { select: { id: true, nombre: true } },
});

@Injectable()
export class VisitWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async requireActor(actorId: number) {
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: actorId },
      select: { id: true, nombre: true, rol: true, activo: true },
    });
    if (!actor || !actor.activo) throw new UnauthorizedException('Usuario inactivo.');
    if (actor.rol !== 'ADMIN' && actor.rol !== 'VENDEDOR') {
      throw new ForbiddenException('No tienes permisos para registrar visitas.');
    }
    return actor;
  }

  private async notify(actorId: number, message: string) {
    try {
      await this.notifications.createNotification({
        mensaje: message,
        remitenteId: actorId,
      });
    } catch {
      // La persistencia de la visita no debe fallar si el canal de notificaciones cae.
    }
  }

  async open(actorId: number) {
    await this.requireActor(actorId);
    return this.prisma.visita.findFirst({
      where: { usuarioId: actorId, estadoVisita: 'INICIADA', fin: null },
      orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
      select: VISIT_SELECT,
    });
  }

  async start(actorId: number, dto: VisitStartDto) {
    const actor = await this.requireActor(actorId);
    if (!dto.clienteId || !dto.motivoVisita || !dto.tipoVisita) {
      throw new BadRequestException('Cliente, motivo y tipo de visita son obligatorios.');
    }
    const record = await this.prisma.$transaction(async (tx) => {
      // Se mantiene un único registro activo por usuario, incluso con doble envío.
      // IS NULL evita que Prisma intente deserializar el tipo PostgreSQL void.
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_advisory_xact_lock(${actorId}::int, 907114) IS NULL AS locked
      `;
      const existing = await tx.visita.findFirst({
        where: { usuarioId: actorId, estadoVisita: 'INICIADA', fin: null },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Ya tienes una visita iniciada. Finalízala o cancélala.');
      }
      const customer = await tx.cliente.findUnique({
        where: { id: dto.clienteId },
        select: { id: true, nombre: true },
      });
      if (!customer) throw new NotFoundException('El cliente seleccionado no existe.');
      return tx.visita.create({
        data: {
          inicio: new Date(),
          usuarioId: actor.id,
          clienteId: customer.id,
          motivoVisita: dto.motivoVisita,
          tipoVisita: dto.tipoVisita,
          estadoVisita: 'INICIADA',
        },
        select: VISIT_SELECT,
      });
    });
    await this.notify(actor.id,
      `El vendedor ${actor.nombre} inició una visita con ${record.cliente.nombre}`);
    return record;
  }

  async finish(actorId: number, id: number, dto: VisitFinishDto) {
    const actor = await this.requireActor(actorId);
    const record = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.visita.updateMany({
        where: { id, usuarioId: actorId, estadoVisita: 'INICIADA', fin: null },
        data: {
          fin: new Date(),
          estadoVisita: 'FINALIZADA',
          observaciones: dto.observaciones.trim() || null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('La visita ya fue cerrada o no pertenece a tu usuario.');
      }
      return tx.visita.findUniqueOrThrow({ where: { id }, select: VISIT_SELECT });
    });
    await this.notify(actor.id,
      `El vendedor ${actor.nombre} finalizó su visita con ${record.cliente.nombre}`);
    return record;
  }

  async cancel(actorId: number, id: number, dto: VisitCancelDto) {
    const actor = await this.requireActor(actorId);
    const reason = dto.motivoCancelacion?.trim();
    if (!reason) throw new BadRequestException('Indica el motivo de cancelación.');
    const record = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.visita.updateMany({
        where: { id, usuarioId: actorId, estadoVisita: 'INICIADA', fin: null },
        data: {
          fin: new Date(),
          estadoVisita: 'CANCELADA',
          observaciones: reason,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('La visita ya fue cerrada o no pertenece a tu usuario.');
      }
      return tx.visita.findUniqueOrThrow({ where: { id }, select: VISIT_SELECT });
    });
    await this.notify(actor.id,
      `El vendedor ${actor.nombre} canceló su visita con ${record.cliente.nombre}`);
    return record;
  }
}
