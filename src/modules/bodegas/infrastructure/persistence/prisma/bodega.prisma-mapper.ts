import { Bodega as PrismaBodega, Prisma } from '@prisma/client';
import { Bodega } from '../../../domain/entities/bodega.entity';
import { BodegaCode } from '../../../domain/value-objects/bodega-code.vo';

export class BodegaPrismaMapper {
  static toDomain(row: PrismaBodega): Bodega {
    return Bodega.rehydrate({
      id: row.id,
      empresaId: row.empresaId,
      codigo: BodegaCode.create(row.codigo),
      nombre: row.nombre,
      descripcion: row.descripcion,
      direccion: row.direccion,
      telefono: row.telefono,
      esPrincipal: row.esPrincipal,
      responsableId: row.responsableId,
      activo: row.activo,
      motivoInactivacion: row.motivoInactivacion,
      inactivadaEn: row.inactivadaEn,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    });
  }

  static toCreateInput(bodega: Bodega): Prisma.BodegaUncheckedCreateInput {
    const row = bodega.snapshot();
    return {
      empresaId: row.empresaId,
      codigo: row.codigo.value,
      nombre: row.nombre,
      descripcion: row.descripcion ?? null,
      direccion: row.direccion ?? null,
      telefono: row.telefono ?? null,
      esPrincipal: row.esPrincipal,
      responsableId: row.responsableId ?? null,
      activo: row.activo,
      motivoInactivacion: row.motivoInactivacion ?? null,
      inactivadaEn: row.inactivadaEn ?? null,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  static toUpdateInput(bodega: Bodega): Prisma.BodegaUncheckedUpdateInput {
    const row = bodega.snapshot();
    return {
      codigo: row.codigo.value,
      nombre: row.nombre,
      descripcion: row.descripcion ?? null,
      direccion: row.direccion ?? null,
      telefono: row.telefono ?? null,
      esPrincipal: row.esPrincipal,
      responsableId: row.responsableId ?? null,
      activo: row.activo,
      motivoInactivacion: row.motivoInactivacion ?? null,
      inactivadaEn: row.inactivadaEn ?? null,
      actualizadoEn: row.actualizadoEn,
    };
  }
}
