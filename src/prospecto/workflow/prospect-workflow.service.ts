import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TipoCliente } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  ProspectWorkflowCancelDto, ProspectWorkflowFinishDto, ProspectWorkflowStartDto,
} from './prospect-workflow.dto';

const PROSPECT_WITH_RELATIONS = Prisma.validator<Prisma.ProspectoInclude>()({
  departamento: { select: { id: true, nombre: true } },
  municipio: { select: { id: true, nombre: true, departamentoId: true } },
  ubicacion: { select: { id: true, latitud: true, longitud: true } },
  vendedor: { select: { id: true, nombre: true } },
});

function optionalText(text: string | undefined) {
  return text?.trim() || null;
}

@Injectable()
export class ProspectWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: number) {
    if (!Number.isInteger(actorId) || actorId < 1) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: actorId }, select: { id: true, activo: true, rol: true },
    });
    if (!actor || !actor.activo) throw new UnauthorizedException('Usuario inactivo o inexistente.');
    if (actor.rol !== 'VENDEDOR' && actor.rol !== 'ADMIN') {
      throw new ForbiddenException('No tienes acceso al registro de prospectos.');
    }
  }

  private async validateLocation(departamentoId: number, municipioId: number) {
    const municipality = await this.prisma.municipio.findUnique({
      where: { id: municipioId }, select: { departamentoId: true },
    });
    if (!municipality || municipality.departamentoId !== departamentoId) {
      throw new BadRequestException('El municipio no corresponde al departamento seleccionado.');
    }
  }

  async open(actorId: number) {
    await this.verifyActor(actorId);
    return this.prisma.prospecto.findFirst({
      where: { usuarioId: actorId, estado: 'EN_PROSPECTO', fin: null },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      include: PROSPECT_WITH_RELATIONS,
    });
  }

  async start(actorId: number, dto: ProspectWorkflowStartDto) {
    await this.verifyActor(actorId);
    if (!dto.nombreCompleto?.trim() && !dto.empresaTienda?.trim()) {
      throw new BadRequestException('Ingresa el nombre del prospecto o el de la empresa.');
    }
    await this.validateLocation(dto.departamentoId, dto.municipioId);

    return this.prisma.$transaction(async (tx) => {
      // Serializa los inicios por usuario incluso con solicitudes simultáneas.
      // pg_advisory_xact_lock devuelve void; Prisma no puede deserializarlo.
      // IS NULL obliga a evaluar el bloqueo pero solo retorna un booleano compatible.
      // No interpretar ese booleano: completar la consulta indica que el lock se obtuvo.
      await tx.$queryRaw<Array<{ lock_evaluated: boolean }>>`
        SELECT pg_advisory_xact_lock(${actorId}::int, 907112) IS NULL AS lock_evaluated
      `;
      const existing = await tx.prospecto.findFirst({
        where: { usuarioId: actorId, estado: 'EN_PROSPECTO', fin: null },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Ya tienes un prospecto abierto. Finalízalo o cancélalo.');
      }

      const created = await tx.prospecto.create({
        data: {
          usuarioId: actorId,
          nombreCompleto: optionalText(dto.nombreCompleto),
          apellido: optionalText(dto.apellido),
          empresaTienda: optionalText(dto.empresaTienda),
          telefono: optionalText(dto.telefono),
          correo: optionalText(dto.correo),
          direccion: optionalText(dto.direccion),
          departamentoId: dto.departamentoId,
          municipioId: dto.municipioId,
          categoriasInteres: [],
          estado: 'EN_PROSPECTO',
        },
        include: PROSPECT_WITH_RELATIONS,
      });
      return created;
    });
  }

  async finish(actorId: number, id: number, dto: ProspectWorkflowFinishDto) {
    await this.verifyActor(actorId);
    if (!dto.nombreCompleto?.trim() && !dto.empresaTienda?.trim()) {
      throw new BadRequestException('El prospecto necesita un nombre o una empresa.');
    }
    if (!dto.tipoCliente) throw new BadRequestException('Selecciona el tipo de cliente.');
    if (!dto.direccion?.trim()) throw new BadRequestException('Ingresa la dirección.');
    if ((dto.latitud === undefined) !== (dto.longitud === undefined)) {
      throw new BadRequestException('Debes proporcionar ambas coordenadas GPS.');
    }

    return this.prisma.$transaction(async (tx) => {
      // No permitir finalizar un registro de otro usuario o uno ya cerrado.
      const previous = await tx.prospecto.findFirst({
        where: { id, usuarioId: actorId, estado: 'EN_PROSPECTO', fin: null },
        select: { id: true, departamentoId: true, municipioId: true },
      });
      if (!previous) {
        throw new ConflictException('Prospecto cerrado, inexistente o no asignado a tu usuario.');
      }
      const dep = dto.departamentoId ?? previous.departamentoId;
      const mun = dto.municipioId ?? previous.municipioId;
      if (!dep || !mun) throw new BadRequestException('Departamento y municipio obligatorios.');
      const loc = await tx.municipio.findUnique({
        where: { id: mun }, select: { departamentoId: true },
      });
      if (loc?.departamentoId !== dep) throw new BadRequestException('Municipio incompatible con departamento.');

      const result = await tx.prospecto.updateMany({
        where: { id, usuarioId: actorId, estado: 'EN_PROSPECTO', fin: null },
        data: {
          nombreCompleto: optionalText(dto.nombreCompleto),
          apellido: optionalText(dto.apellido),
          empresaTienda: optionalText(dto.empresaTienda),
          telefono: optionalText(dto.telefono),
          correo: optionalText(dto.correo),
          direccion: dto.direccion.trim(),
          departamentoId: dep,
          municipioId: mun,
          tipoCliente: dto.tipoCliente as TipoCliente,
          categoriasInteres: dto.categoriasInteres ?? [],
          volumenCompra: optionalText(dto.volumenCompra),
          presupuestoMensual: optionalText(dto.presupuestoMensual),
          preferenciaContacto: optionalText(dto.preferenciaContacto),
          comentarios: optionalText(dto.comentarios),
          estado: 'FINALIZADO', fin: new Date(),
        },
      });
      if (result.count !== 1) throw new ConflictException('El prospecto ya fue cerrado.');

      if (dto.latitud !== undefined && dto.longitud !== undefined) {
        const geo = await tx.ubicacionProspecto.create({
          data: { prospectoId: id, latitud: dto.latitud, longitud: dto.longitud },
        });
        await tx.prospecto.update({
          where: { id }, data: { ubicacionId: geo.id },
        });
      }
      return tx.prospecto.findUniqueOrThrow({
        where: { id }, include: PROSPECT_WITH_RELATIONS,
      });
    });
  }

  async cancel(actorId: number, id: number, dto: ProspectWorkflowCancelDto) {
    await this.verifyActor(actorId);
    const motivo = dto.motivo?.trim();
    if (!motivo) throw new BadRequestException('Indica el motivo de cancelación.');
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.prospecto.updateMany({
        where: { id, usuarioId: actorId, estado: 'EN_PROSPECTO', fin: null },
        data: { estado: 'CERRADO', fin: new Date(), comentarios: motivo },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Prospecto cerrado, inexistente o no asignado a tu usuario.');
      }
      return tx.prospecto.findUniqueOrThrow({
        where: { id }, include: PROSPECT_WITH_RELATIONS,
      });
    });
  }
}
