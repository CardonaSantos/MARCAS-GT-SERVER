import { createHash } from 'crypto';
import { ComprobanteActorPort } from '../ports/comprobante-actor.port';
import { ComprobanteError } from '../../domain/comprobante.errors';
import {
  ActorComprobante, ComprobanteEmitido, DocumentoBorrador,
  RegistrarAccionComprobante, TipoComprobante,
} from '../../domain/comprobante.types';
import { ComprobanteRepositoryPort } from '../../domain/ports/comprobante-repository.port';
import { ComprobanteSourcePort } from '../../domain/ports/comprobante-source.port';

type SourceReference = { tipo: 'SALIDA_DESPACHO'; despachoId: number; id: number } |
  { tipo: 'ENTREGA'; id: number };

export class ComprobanteUseCases {
  constructor(
    private readonly actors: ComprobanteActorPort,
    private readonly sources: ComprobanteSourcePort,
    private readonly records: ComprobanteRepositoryPort,
  ) {}

  private async actor(actorId: number): Promise<ActorComprobante> {
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
      throw new ComprobanteError('ACTOR_INVALIDO', 'Sesión inválida.');
    }
    const actor = await this.actors.findActive(actorId);
    if (!actor) throw new ComprobanteError('ACTOR_INVALIDO', 'Usuario inactivo o sin empresa.');
    return actor;
  }

  private async source(ref: SourceReference, empresaId: number): Promise<DocumentoBorrador> {
    const document = ref.tipo === 'SALIDA_DESPACHO'
      ? await this.sources.salida(ref.despachoId, ref.id, empresaId)
      : await this.sources.entrega(ref.id, empresaId);
    if (!document || document.tipo !== ref.tipo || document.referenciaId !== ref.id) {
      throw new ComprobanteError('NO_ENCONTRADO', 'No existe un registro emitible en tu empresa.');
    }
    return document;
  }

  private number(tipo: TipoComprobante, referenciaId: number) {
    const prefix = tipo === 'SALIDA_DESPACHO' ? 'NSB' : 'CEN';
    return prefix + '-' + String(referenciaId).padStart(9, '0');
  }

  async preview(ref: SourceReference, actorId: number) {
    const actor = await this.actor(actorId);
    const existing = await this.records.findBySource(actor.empresaId, ref.tipo, ref.id);
    if (existing) return { emitido: true, comprobante: existing, snapshot: existing.snapshot };
    const draft = await this.source(ref, actor.empresaId);
    return { emitido: false, comprobante: null, numeroPrevisto: this.number(ref.tipo, ref.id), snapshot: draft.snapshot };
  }

  async issue(ref: SourceReference, actorId: number): Promise<ComprobanteEmitido> {
    const actor = await this.actor(actorId);
    const existing = await this.records.findBySource(actor.empresaId, ref.tipo, ref.id);
    if (existing) return existing; // Reimpresiones no alteran el snapshot.
    const draft = await this.source(ref, actor.empresaId);
    const json = JSON.stringify(draft.snapshot);
    const huellaSha256 = createHash('sha256').update(json).digest('hex');
    return this.records.issue({
      empresaId: actor.empresaId,
      tipo: draft.tipo,
      referenciaId: draft.referenciaId,
      numero: this.number(draft.tipo, draft.referenciaId),
      snapshot: draft.snapshot,
      huellaSha256,
      emitidoPorId: actor.id,
    });
  }

  async get(id: number, actorId: number): Promise<ComprobanteEmitido> {
    const actor = await this.actor(actorId);
    const found = await this.records.findById(actor.empresaId, id);
    if (!found) throw new ComprobanteError('NO_ENCONTRADO', 'Comprobante no encontrado.');
    return found;
  }

  async action(
    id: number,
    actorId: number,
    fields: Pick<RegistrarAccionComprobante, 'accion' | 'canal' | 'claveIdempotencia'>,
  ) {
    const actor = await this.actor(actorId);
    const found = await this.records.findById(actor.empresaId, id);
    if (!found) throw new ComprobanteError('NO_ENCONTRADO', 'Comprobante no encontrado.');
    return this.records.action({
      comprobanteId: id, empresaId: actor.empresaId, usuarioId: actor.id,
      ...fields,
    });
  }
}
