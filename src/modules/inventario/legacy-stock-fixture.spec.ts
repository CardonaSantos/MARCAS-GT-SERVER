import {
  assertTestDatabaseEnvironment, parseFixtureArgs, receiptFingerprint,
} from '../../../scripts/legacy-stock-fixture';

describe('Simulador de ingreso Stock legacy — barreras de seguridad', () => {
  const local = {
    NODE_ENV: 'development', LEGACY_STOCK_FIXTURE_TEST: 'YES',
    DATABASE_URL: 'postgresql://local:password@localhost:5432/marcas_test?schema=public',
  };
  const remote = { ...local, DATABASE_URL: 'postgresql://local:password@remote.db:5432/test' };
  it('bloquea producción o sin confirmación explícita de test', () => {
    expect(() => assertTestDatabaseEnvironment({ ...local, NODE_ENV: 'production' }, false)).toThrow();
    expect(() => assertTestDatabaseEnvironment({ ...local, LEGACY_STOCK_FIXTURE_TEST: 'NO' }, false)).toThrow();
    expect(() => assertTestDatabaseEnvironment({ ...local, DATABASE_URL: '' }, false)).toThrow();
  });
  it('permite PostgreSQL local y restringe conexiones remotas', () => {
    expect(assertTestDatabaseEnvironment(local, false)).toMatchObject({
      host: 'localhost', database: 'marcas_test',
    });
    expect(() => assertTestDatabaseEnvironment(remote, false)).toThrow('remota');
    expect(() => assertTestDatabaseEnvironment(remote, true)).toThrow('remota');
    expect(assertTestDatabaseEnvironment({
      ...remote, LEGACY_STOCK_FIXTURE_REMOTE_TEST: 'YES',
    }, true)).toMatchObject({ host: 'remote.db' });
  });
  it('requiere flags válidos y una confirmación distinta al backfill', () => {
    expect(() => parseFixtureArgs([
      '--mode=apply','--producto-id=7','--cantidad=20','--run-id=PRUEBA001',
    ])).toThrow('confirmar');
    expect(parseFixtureArgs([
      '--mode=apply','--producto-id=7','--cantidad=20','--run-id=PRUEBA001',
      '--confirm=ENSAYO_STOCK_LEGACY',
    ])).toMatchObject({
      mode: 'apply', productoId: 7, cantidad: 20, runId: 'PRUEBA001', proveedorId: null,
    });
    expect(() => parseFixtureArgs([
      '--mode=preview','--producto-id=0','--cantidad=20','--run-id=PRUEBA001',
    ])).toThrow('entero positivo');
    expect(() => parseFixtureArgs([
      '--mode=preview','--producto-id=7','--cantidad=-1','--run-id=PRUEBA001',
    ])).toThrow('entero positivo');
    expect(() => parseFixtureArgs([
      '--mode=preview','--producto-id=7','--cantidad=20','--run-id=../escape',
    ])).toThrow('--run-id');
    expect(parseFixtureArgs([
      '--mode=preview','--producto-id=7','--cantidad=20',
      '--run-id=PRUEBA001','--costo-unitario=12.34',
    ]).costoUnitario).toBe(12.34);
    expect(() => parseFixtureArgs([
      '--mode=preview','--producto-id=7','--cantidad=20',
      '--run-id=PRUEBA001','--costo-unitario=12.34567',
    ])).toThrow('precio válido');
  });
  it('crea huella estable de comprobante y detecta cambios', () => {
    const record = {
      version: 1 as const, runId: 'PRUEBA001', status: 'APPLIED' as const,
      productoId: 7, cantidad: 20, costoUnitario: 25,
      proveedorId: null, createdAt: '2026-10-10T10:00:00.000Z',
      entregaStockId: 14, stockId: 9, cantidadAntes: 0, cantidadDespues: 20,
    };
    expect(receiptFingerprint(record)).toHaveLength(64);
    expect(receiptFingerprint(record)).toBe(receiptFingerprint(record));
    expect(receiptFingerprint({ ...record, cantidad: 21 })).not.toBe(receiptFingerprint(record));
  });
});
