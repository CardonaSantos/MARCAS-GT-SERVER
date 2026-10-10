import {
  assertCandidateCurrent, movementKey, undoKey, strictMoney, seal,
} from '../../../scripts/legacy-stock-backfill';

describe('Backfill Stock legacy — controles de seguridad', () => {
  const now = new Date('2026-10-10T14:00:00.000Z');
  const saved = {
    stockId: 58, productoId: 7, sku: 'SKU-7', nombre: 'Pantalón',
    cantidad: 12, costoUnitario: '45.1000', proveedorId: 2,
    costoTotalLegacy: 900, stockActualizadoEn: now.toISOString(),
    productoActualizadoEn: now.toISOString(), status: 'READY' as const,
  };
  const current = {
    id: 58, productoId: 7, cantidad: 12, proveedorId: 2,
    costoTotal: 900, actualizadoEn: now,
    producto: { nombre: 'Pantalón', codigoProducto: 'SKU-7', costo: 45.1, actualizadoEn: now },
  };

  it('proporciona claves únicas por Stock y bodega y separa rollback', () => {
    expect(movementKey(1, 58)).toBe('LEGACY_STOCK:V1:BODEGA:1:STOCK:58');
    expect(movementKey(1, 58)).toBe(movementKey(1, 58));
    expect(movementKey(1, 58)).not.toBe(movementKey(1, 59));
    expect(movementKey(1, 58)).not.toBe(movementKey(2, 58));
    expect(undoKey(1, 58)).not.toBe(movementKey(1, 58));
  });

  it('valida precisión decimal y rechaza costos inválidos', () => {
    expect(strictMoney(45.1)).toBe('45.1000');
    expect(strictMoney(0)).toBe('0.0000');
    expect(strictMoney(45.12346)).toBe('45.1235');
    expect(strictMoney(-1)).toBeNull();
    expect(strictMoney(Number.POSITIVE_INFINITY)).toBeNull();
    expect(strictMoney(null)).toBeNull();
  });

  it('acepta snapshot intacto después de registrar ventas antes del plan', () => {
    expect(() => assertCandidateCurrent(saved, current)).not.toThrow();
  });

  it('bloquea una venta legacy posterior al snapshot', () => {
    expect(() => assertCandidateCurrent(saved, { ...current, cantidad: 11 }))
      .toThrow('cambió desde el plan');
    expect(() => assertCandidateCurrent(saved, {
      ...current, actualizadoEn: new Date('2026-10-10T14:05:00Z'),
    })).toThrow('cambió desde el plan');
  });

  it('bloquea cambios de costo, proveedor o desaparición del origen', () => {
    expect(() => assertCandidateCurrent(saved, { ...current, proveedorId: 3 })).toThrow();
    expect(() => assertCandidateCurrent(saved, {
      ...current, producto: { ...current.producto, costo: 50 },
    })).toThrow();
    expect(() => assertCandidateCurrent(saved, null)).toThrow();
  });

  it('sella el contenido de planes sin incluir la firma previa', () => {
    const body = {
      schemaVersion: 1 as const, batchId: 'LEGACY_STOCK_V1',
      createdAt: now.toISOString(),
      warehouse: { id: 1, empresaId: 1, nombre: 'Principal' },
      rows: [saved],
      sales: {
        ventas: { count: 2, sha256: 'ventas-hash' },
        lineas: { count: 4, sha256: 'lineas-hash' },
      },
    };
    const digest = seal(body);
    expect(digest).toHaveLength(64);
    expect(digest).toBe(seal(body));
    expect(digest).not.toBe(seal({
      ...body, rows: [{ ...saved, cantidad: 13 }],
    }));
    expect(digest).not.toBe(seal({
      ...body, sales: { ...body.sales, ventas: { count: 3, sha256: 'ventas-hash' } },
    }));
  });
});
