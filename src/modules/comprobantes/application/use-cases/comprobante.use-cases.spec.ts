import { createHash } from 'crypto';
import { ComprobanteUseCases } from './comprobante.use-cases';
import { ComprobanteError } from '../../domain/comprobante.errors';
import { ComprobanteActorPort } from '../ports/comprobante-actor.port';
import { ComprobanteSourcePort } from '../../domain/ports/comprobante-source.port';
import { ComprobanteRepositoryPort } from '../../domain/ports/comprobante-repository.port';
import { ComprobanteEmitido } from '../../domain/comprobante.types';

describe('Comprobantes: reglas de emision y consulta', () => {
  const actors = { findActive: jest.fn() };
  const sources = { salida: jest.fn(), entrega: jest.fn() };
  const records = { findBySource: jest.fn(), findById: jest.fn(), issue: jest.fn(), action: jest.fn() };
  const use = new ComprobanteUseCases(actors as ComprobanteActorPort,
    sources as ComprobanteSourcePort, records as ComprobanteRepositoryPort);
  const draft = { tipo: 'SALIDA_DESPACHO' as const, referenciaId: 55,
    snapshot: { documento: { despachoId: 10, operacionId: 55 },
      lineas: [{ producto: { codigo: 'P1' }, cantidad: 3 }] } };
  const issued: ComprobanteEmitido = {
    ...draft, id: 99, numero: 'NSB-000000055', empresaId: 7,
    version: 1, huellaSha256: 'a'.repeat(64), emitidoPorId: 2,
    emitidoEn: new Date('2026-10-09T00:00:00.000Z'),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    actors.findActive.mockResolvedValue({ id: 2, empresaId: 7 });
    sources.salida.mockResolvedValue(draft);
    sources.entrega.mockResolvedValue({ tipo: 'ENTREGA', referenciaId: 8,
      snapshot: { clase: 'CONSTANCIA_ENTREGA', lineas: [] } });
    records.findBySource.mockResolvedValue(null);
    records.findById.mockResolvedValue(issued);
    records.issue.mockResolvedValue(issued);
    records.action.mockResolvedValue({ id: 4, repeated: false });
  });

  it('rechaza usuario inactivo / sin empresa', async () => {
    actors.findActive.mockResolvedValueOnce(null);
    await expect(use.issue({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2))
      .rejects.toMatchObject({ code: 'ACTOR_INVALIDO' });
    expect(sources.salida).not.toHaveBeenCalled();
  });

  it('scope de empresa se determina del actor, no del request', async () => {
    await use.preview({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2);
    expect(sources.salida).toHaveBeenCalledWith(10, 55, 7);
    expect(records.findBySource).toHaveBeenCalledWith(7, 'SALIDA_DESPACHO', 55);
  });

  it('distingue preview de emision: no escribe en BD', async () => {
    const preview = await use.preview({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2);
    expect(preview.emitido).toBe(false);
    expect(preview.numeroPrevisto).toBe('NSB-000000055');
    expect(records.issue).not.toHaveBeenCalled();
  });

  it('emite una sola vez con hash SHA256 y fuente de salida especifica', async () => {
    const result = await use.issue({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2);
    expect(result).toBe(issued);
    const expected = createHash('sha256').update(JSON.stringify(draft.snapshot)).digest('hex');
    expect(records.issue).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 7, tipo: 'SALIDA_DESPACHO', referenciaId: 55,
      numero: 'NSB-000000055', emitidoPorId: 2, huellaSha256: expected,
    }));
  });

  it('reimpresion devuelve snapshot historico sin recomponer el origen', async () => {
    records.findBySource.mockResolvedValueOnce(issued);
    const doc = await use.issue({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2);
    expect(doc).toBe(issued);
    expect(sources.salida).not.toHaveBeenCalled();
    expect(records.issue).not.toHaveBeenCalled();
  });

  it('no admite referencia equivocada ni fuente de otra empresa', async () => {
    sources.salida.mockResolvedValueOnce(null);
    await expect(use.issue({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2))
      .rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(records.issue).not.toHaveBeenCalled();
  });

  it('propaga rechazo de estado operativo no emitible', async () => {
    sources.salida.mockRejectedValueOnce(new ComprobanteError('NO_EMITIBLE', 'Salida pendiente.'));
    await expect(use.issue({ tipo: 'SALIDA_DESPACHO', despachoId: 10, id: 55 }, 2))
      .rejects.toMatchObject({ code: 'NO_EMITIBLE' });
    expect(records.issue).not.toHaveBeenCalled();
  });

  it('emite constancia de entrega sin facturar ni mover stock', async () => {
    await use.issue({ tipo: 'ENTREGA', id: 8 }, 2);
    expect(sources.entrega).toHaveBeenCalledWith(8, 7);
    expect(records.issue).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'ENTREGA', referenciaId: 8, numero: 'CEN-000000008',
    }));
    expect(sources.salida).not.toHaveBeenCalled();
  });

  it('acceso al comprobante emitido condicionado a la empresa', async () => {
    await expect(use.get(99, 2)).resolves.toEqual(issued);
    expect(records.findById).toHaveBeenCalledWith(7, 99);
    records.findById.mockResolvedValueOnce(null);
    await expect(use.get(99, 2)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('accion de impresion crea auditoria con actor autenticado y clave', async () => {
    await use.action(99, 2, {
      accion: 'IMPRESION_SOLICITADA', canal: 'TERMICA_80MM',
      claveIdempotencia: 'PRINT-000001',
    });
    expect(records.action).toHaveBeenCalledWith({
      comprobanteId: 99, empresaId: 7, usuarioId: 2,
      accion: 'IMPRESION_SOLICITADA', canal: 'TERMICA_80MM',
      claveIdempotencia: 'PRINT-000001',
    });
  });
});
