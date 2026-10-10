import { Injectable } from '@nestjs/common';
import { Prisma, TipoComprobanteOperativo, AccionComprobanteOperativo } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { ComprobanteError } from '../../../domain/comprobante.errors';
import {
  ComprobanteEmitido, CrearComprobante, RegistrarAccionComprobante, TipoComprobante,
} from '../../../domain/comprobante.types';
import { ComprobanteRepositoryPort } from '../../../domain/ports/comprobante-repository.port';

@Injectable()
export class ComprobantePrismaRepository implements ComprobanteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: any): ComprobanteEmitido {
    return {
      id: row.id, numero: row.numero, empresaId: row.empresaId,
      tipo: row.tipo, referenciaId: row.referenciaId,
      version: row.version, snapshot: row.snapshot as Record<string, unknown>,
      huellaSha256: row.huellaSha256, emitidoPorId: row.emitidoPorId, emitidoEn: row.emitidoEn,
    };
  }

  async findBySource(empresaId: number, tipo: TipoComprobante, referenciaId: number) {
    const row = await this.prisma.comprobanteOperativo.findUnique({
      where: { empresaId_tipo_referenciaId: { empresaId, tipo, referenciaId } },
    });
    return row ? this.map(row) : null;
  }

  async findById(empresaId: number, id: number) {
    const row = await this.prisma.comprobanteOperativo.findFirst({ where: { id, empresaId } });
    return row ? this.map(row) : null;
  }

  async issue(command: CrearComprobante) {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.comprobanteOperativo.create({
          data: {
            empresaId: command.empresaId,
            tipo: command.tipo as TipoComprobanteOperativo,
            referenciaId: command.referenciaId, numero: command.numero,
            version: 1, snapshot: command.snapshot as Prisma.InputJsonValue,
            huellaSha256: command.huellaSha256, emitidoPorId: command.emitidoPorId,
          },
        });
        await tx.comprobanteOperativoEvento.create({
          data: {
            comprobanteId: row.id, usuarioId: command.emitidoPorId,
            accion: 'EMITIDO', claveIdempotencia:
              'EMISION:' + command.empresaId + ':' + command.tipo + ':' + command.referenciaId,
          },
        });
        return row;
      });
      return this.map(created);
    } catch (error) {
      // Dos emisiones concurrentes de la misma fuente devuelven el mismo snapshot.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findBySource(command.empresaId, command.tipo, command.referenciaId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async action(command: RegistrarAccionComprobante) {
    const create = async () => this.prisma.comprobanteOperativoEvento.create({
      data: {
        comprobanteId: command.comprobanteId, usuarioId: command.usuarioId,
        accion: command.accion as AccionComprobanteOperativo,
        canal: command.canal ?? null, claveIdempotencia: command.claveIdempotencia,
      },
    });
    try {
      const created = await create();
      return { id: created.id, repeated: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const found = await this.prisma.comprobanteOperativoEvento.findUnique({
          where: { claveIdempotencia: command.claveIdempotencia },
        });
        if (found && found.comprobanteId === command.comprobanteId &&
            found.usuarioId === command.usuarioId && found.accion === command.accion &&
            (found.canal ?? null) === (command.canal ?? null)) {
          return { id: found.id, repeated: true };
        }
        throw new ComprobanteError('CONFLICTO', 'La clave de idempotencia pertenece a otra operación.');
      }
      throw error;
    }
  }
}
