/**
 * Herramienta de ENSAYO local para simular StockService.addStock legacy.
 * NUNCA desplegar/ejecutar en la base de producción.
 *
 * Importa sólo en Stock + EntregaStock + EntregaStockProducto, NO en StockBodega.
 * El backfill real está en scripts/legacy-stock-backfill.ts.
 */
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnvironment } from 'dotenv';

const RECEIPT_DIRECTORY = resolve('migration-reports', 'legacy-fixtures');
const CONFIRM = 'ENSAYO_STOCK_LEGACY';
export type FixtureMode = 'preview' | 'apply' | 'inspect';
export type FixtureArgs = {
  mode: FixtureMode; productoId: number; cantidad: number | null;
  proveedorId: number | null; costoUnitario: number | null; runId: string;
  confirm: string | null; allowRemote: boolean;
};
export type FixtureReceipt = {
  version: 1; runId: string; status: 'PENDING' | 'APPLIED';
  productoId: number; cantidad: number; costoUnitario: number;
  proveedorId: number | null; createdAt: string;
  entregaStockId: number | null; stockId: number | null;
  cantidadAntes: number | null; cantidadDespues: number | null;
  seal: string;
};
type Transaction = Prisma.TransactionClient;

export function parseFixtureArgs(argv: string[]): FixtureArgs {
  const allowed = new Set(['mode','producto-id','cantidad','costo-unitario','proveedor-id','run-id','confirm','allow-remote-test']);
  const vals: Record<string, string> = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1]) || vals[match[1]]) {
      throw new Error('Argumento inválido o duplicado: ' + argument);
    }
    vals[match[1]] = match[2];
  }
  const mode = vals.mode;
  if (!['preview','apply','inspect'].includes(mode)) throw new Error('--mode=preview|apply|inspect es obligatorio.');
  const n = (value: string | undefined, name: string, optional = false) => {
    if (value == null && optional) return null;
    const number = Number(value);
    if (!value || !Number.isSafeInteger(number) || number < 1) throw new Error(name + ' debe ser entero positivo.');
    return number;
  };
  const productoId = n(vals['producto-id'], '--producto-id')!;
  const cantidad = n(vals.cantidad, '--cantidad', mode !== 'apply');
  const proveedorId = n(vals['proveedor-id'], '--proveedor-id', true);
  let costoUnitario: number | null = null;
  if (vals['costo-unitario'] != null) {
    costoUnitario = Number(vals['costo-unitario']);
    if (!Number.isFinite(costoUnitario) || costoUnitario < 0 || costoUnitario > 99999999 ||
        !/^[0-9]+(?:\.[0-9]{1,4})?$/.test(vals['costo-unitario'])) {
      throw new Error('--costo-unitario debe ser un precio válido con hasta 4 decimales.');
    }
  }
  const runId = vals['run-id'] ?? '';
  if (!/^[A-Za-z0-9_-]{6,50}$/.test(runId)) {
    throw new Error('--run-id requiere 6-50 caracteres (letras, números, _ o -). Utiliza un ID nuevo por ensayo.');
  }
  if (mode === 'apply' && vals.confirm !== CONFIRM) {
    throw new Error('Para escribir debes confirmar --confirm=' + CONFIRM);
  }
  if (vals['allow-remote-test'] != null && vals['allow-remote-test'] !== 'true') {
    throw new Error('--allow-remote-test sólo admite true.');
  }
  return {
    mode: mode as FixtureMode, productoId, cantidad,
    proveedorId, costoUnitario, runId,
    confirm: vals.confirm ?? null, allowRemote: vals['allow-remote-test'] === 'true',
  };
}

export function assertTestDatabaseEnvironment(
  env: Record<string, string | undefined>, allowRemote: boolean,
) {
  if (env.NODE_ENV?.toLowerCase() === 'production') throw new Error('NODE_ENV=production: prohibido.');
  if (env.LEGACY_STOCK_FIXTURE_TEST !== 'YES') {
    throw new Error('Falta LEGACY_STOCK_FIXTURE_TEST=YES. Este CLI es SOLO PARA ENSAYOS.');
  }
  if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
  let dbUrl: URL;
  try { dbUrl = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL inválida.'); }
  if (!['postgresql:', 'postgres:'].includes(dbUrl.protocol)) throw new Error('Sólo PostgreSQL está soportado.');
  const isLocal = ['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname.toLowerCase());
  if (!isLocal && !(allowRemote && env.LEGACY_STOCK_FIXTURE_REMOTE_TEST === 'YES')) {
    throw new Error('La base es remota. Se bloquea por defecto. Sólo staging/pruebas explícitas: ' +
      '--allow-remote-test=true junto con LEGACY_STOCK_FIXTURE_REMOTE_TEST=YES.');
  }
  return { host: dbUrl.hostname, database: decodeURIComponent(dbUrl.pathname.slice(1)) };
}

export function receiptFingerprint(receipt: Omit<FixtureReceipt,'seal'>): string {
  return createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}
function withSeal(receipt: Omit<FixtureReceipt,'seal'>): FixtureReceipt {
  return { ...receipt, seal: receiptFingerprint(receipt) };
}
function receiptPath(runId: string): string {
  return join(RECEIPT_DIRECTORY, runId + '.json');
}
function readReceipt(runId: string): FixtureReceipt | null {
  const path = receiptPath(runId);
  if (!existsSync(path)) return null;
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as FixtureReceipt;
  const { seal, ...body } = receipt;
  if (receipt.version !== 1 || receipt.runId !== runId || seal !== receiptFingerprint(body)) {
    throw new Error('Comprobante alterado o incompatible: ' + path);
  }
  return receipt;
}
function reserveReceipt(receipt: FixtureReceipt) {
  mkdirSync(RECEIPT_DIRECTORY, { recursive: true });
  writeFileSync(receiptPath(receipt.runId), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
}
function completeReceipt(receipt: FixtureReceipt) {
  const path = receiptPath(receipt.runId);
  const temp = path + '.tmp-' + process.pid;
  writeFileSync(temp, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  renameSync(temp, path);
}
function asFour(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 99999999) return null;
  return new Prisma.Decimal(value).toDecimalPlaces(4).toFixed(4);
}

async function readContext(db: PrismaClient | Transaction, opts: FixtureArgs) {
  const product = await db.producto.findUnique({
    where: { id: opts.productoId },
    select: { id: true, codigoProducto: true, nombre: true, costo: true },
  });
  if (!product) throw new Error('Producto #' + opts.productoId + ' no existe. Crea un producto primero.');
  const original = await db.stock.findUnique({ where: { productoId: opts.productoId } });
  if (original && (!Number.isSafeInteger(original.cantidad) || original.cantidad < 0 ||
      !Number.isFinite(original.costoTotal) || original.costoTotal < 0)) {
    throw new Error('Stock legacy tiene saldo/costo irregular. Concilia antes de ingresar nuevas unidades.');
  }
  const [newStock, newMoves] = await Promise.all([
    db.stockBodega.count({ where: { productoId: opts.productoId } }),
    db.movimientoInventario.count({ where: { productoId: opts.productoId } }),
  ]);
  if (newStock || newMoves) throw new Error(
    'Producto ya usado en Inventario nuevo: ' + product.codigoProducto +
    ' (' + newStock + ' filas StockBodega, ' + newMoves + ' movimientos). ' +
    'Selecciona otro producto sin movimientos nuevos.');
  const unit = opts.costoUnitario ?? product.costo;
  const fixed = asFour(unit);
  if (fixed == null) throw new Error('Producto sin costo válido. Añade --costo-unitario=VALOR.');
  const legacyCost = asFour(product.costo);
  if (legacyCost === null || fixed !== legacyCost) throw new Error(
    'El costo de ingreso debe coincidir con Producto.costo (' + String(product.costo) +
    ') para que la migración posterior conserve la valoración. Ajusta el catálogo antes del ensayo.');
  if (opts.proveedorId != null) {
    const provider = await db.proveedor.findUnique({
      where: { id: opts.proveedorId }, select: { id: true },
    });
    if (!provider) throw new Error('Proveedor #' + opts.proveedorId + ' no existe.');
  }
  return { product, original, unit: Number(fixed) };
}

function printPreview(ctx: Awaited<ReturnType<typeof readContext>>, args: FixtureArgs) {
  const before = ctx.original?.cantidad ?? 0;
  const qty = args.cantidad ?? 0;
  console.log('\n--- STOCK LEGACY (ENSAYO) ---');
  console.log('Producto: #' + ctx.product.id + ' · ' + ctx.product.codigoProducto + ' · ' + ctx.product.nombre);
  console.log('Stock.cantidad ANTES : ' + before);
  console.log('Ingreso propuesto     : ' + (args.cantidad ?? 'No indicado (modo inspect)'));
  console.log('Stock.cantidad DESPUÉS: ' + (args.cantidad == null ? 'sin simulación' : before + qty));
  console.log('Costo unitario        : Q ' + ctx.unit.toFixed(4));
  console.log('Stock.costoTotal antes: Q ' + (ctx.original?.costoTotal ?? 0).toFixed(2));
  if (args.cantidad != null) console.log('Stock.costoTotal después: Q ' +
    ((ctx.original?.costoTotal ?? 0) + qty * ctx.unit).toFixed(2));
  console.log('StockBodega           : NO SE TOCA (vacío para este producto)');
  console.log('Ventas y pagos        : NO SE TOCAN');
}

async function inspectReceipt(db: PrismaClient, args: FixtureArgs) {
  const receipt = readReceipt(args.runId);
  if (!receipt) { console.log('No existe comprobante local para run-id=' + args.runId); return; }
  if (receipt.productoId !== args.productoId) throw new Error('El run-id corresponde a otro producto.');
  if (receipt.status === 'PENDING') {
    console.log('ATENCIÓN: comprobante PENDING. La transacción pudo haber finalizado.');
    console.log('NO REPITAS apply con un run-id nuevo sin investigar en PostgreSQL.');
    console.log('Revisa EntregaStock y sus productos, más Stock, antes de continuar.');
    console.log('Comprobante: ' + receiptPath(args.runId));
    process.exitCode = 2;
    return;
  }
  const delivery = await db.entregaStock.findUnique({
    where: { id: receipt.entregaStockId! },
    include: { productos: true },
  });
  const stock = await db.stock.findUnique({ where: { productoId: args.productoId } });
  console.log('\n--- RESULTADO LEGACY GUARDADO ---');
  console.log('Run ID                : ' + receipt.runId);
  console.log('EntregaStock ID       : #' + receipt.entregaStockId);
  console.log('Producto ID           : #' + receipt.productoId);
  console.log('Cantidad ingresada    : ' + receipt.cantidad);
  console.log('Cantidad ANTES        : ' + receipt.cantidadAntes);
  console.log('Cantidad TRAS INGRESO : ' + receipt.cantidadDespues);
  console.log('Cantidad ACTUAL       : ' + (stock?.cantidad ?? 'Sin fila Stock'));
  console.log('Entrega y línea        : ' +
    (delivery?.productos.some(p => p.productoId === receipt.productoId &&
        p.cantidad === receipt.cantidad) ? 'PRESENTES' : 'NO COINCIDEN'));
  console.log('StockBodega           : no fue modificado por este script.');
  console.log('Para planear el backfill usa --mode=plan del comando stock:legacy.');
  if (!delivery || !delivery.productos.some(p => p.productoId === receipt.productoId &&
      p.cantidad === receipt.cantidad)) process.exitCode = 2;
}

async function applyFixture(db: PrismaClient, args: FixtureArgs) {
  if (args.cantidad == null) throw new Error('Cantidad obligatoria para aplicar.');
  const previous = readReceipt(args.runId);
  if (previous) {
    if (previous.productoId !== args.productoId ||
        previous.cantidad !== args.cantidad ||
        (args.proveedorId != null && previous.proveedorId !== args.proveedorId) ||
        (args.costoUnitario != null && previous.costoUnitario !== args.costoUnitario)) {
      throw new Error('El run-id ya está reservado con parámetros diferentes. No se repite el ingreso.');
    }
    console.log('Ya existe run-id=' + args.runId + '. NO se vuelve a incrementar Stock.');
    await inspectReceipt(db, args);
    return;
  }
  const ctx = await readContext(db, args);
  const amount = args.cantidad * ctx.unit;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error(
    'El campo legacy EntregaStock.total_pagado es INT. Usa cantidad/costo con un total entero válido.');
  if ((ctx.original?.cantidad ?? 0) + args.cantidad > 2147483647) throw new Error('Stock.cantidad excedería INT.');
  printPreview(ctx, args);
  const body: Omit<FixtureReceipt, 'seal'> = {
    version: 1, runId: args.runId, status: 'PENDING',
    productoId: args.productoId, cantidad: args.cantidad, costoUnitario: ctx.unit,
    proveedorId: args.proveedorId, createdAt: new Date().toISOString(),
    entregaStockId: null, stockId: null, cantidadAntes: null, cantidadDespues: null,
  };
  // Crear PENDING ANTES de la transacción: ante un crash nos detenemos, no duplicamos.
  reserveReceipt(withSeal(body));
  try {
    const result = await db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(472641, 1)');
      const locked = await readContext(tx, args);
      // No permitir entradas concurrentes entre vista previa y operación.
      if (locked.original?.id !== ctx.original?.id ||
          locked.original?.cantidad !== ctx.original?.cantidad ||
          locked.original?.costoTotal !== ctx.original?.costoTotal) throw new Error(
        'Stock cambió concurrentemente; no se registró el ingreso.');
      const delivery = await tx.entregaStock.create({
        data: {
          proveedorId: args.proveedorId,
          total_pagado: amount,
          productos: { create: [{
            productoId: args.productoId, cantidad: args.cantidad!,
            costoUnitario: locked.unit,
          }] },
        },
      });
      let stock;
      if (locked.original) {
        const updated = await tx.stock.updateMany({
          where: { id: locked.original.id, cantidad: locked.original.cantidad, costoTotal: locked.original.costoTotal },
          data: {
            cantidad: { increment: args.cantidad! },
            costoTotal: { increment: amount },
          },
        });
        if (updated.count !== 1) throw new Error('Cambio concurrente de Stock; transacción revertida.');
        stock = await tx.stock.findUniqueOrThrow({ where: { productoId: args.productoId } });
      } else {
        stock = await tx.stock.create({
          data: { productoId: args.productoId, proveedorId: args.proveedorId,
            cantidad: args.cantidad!, costoTotal: amount },
        });
      }
      return { deliveryId: delivery.id, stockId: stock.id,
        before: locked.original?.cantidad ?? 0, after: stock.cantidad,
        total: stock.costoTotal, expected: amount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000, maxWait: 10_000 });
    completeReceipt(withSeal({ ...body, status: 'APPLIED',
      entregaStockId: result.deliveryId, stockId: result.stockId,
      cantidadAntes: result.before, cantidadDespues: result.after }));
    console.log('\n--- INGRESO LEGACY CONFIRMADO ---');
    console.log('Ensayo ID       : ' + args.runId);
    console.log('EntregaStock    : #' + result.deliveryId);
    console.log('Stock           : #' + result.stockId);
    console.log('Ingreso         : +' + args.cantidad + ' unidades');
    console.log('Cantidad antes  : ' + result.before);
    console.log('Cantidad después: ' + result.after);
    console.log('Costo acumulado : Q ' + result.total.toFixed(2));
    console.log('Ventas históricas: SIN MODIFICACIONES');
    console.log('StockBodega     : SIN MODIFICACIONES');
    console.log('Comprobante     : ' + receiptPath(args.runId));
    console.log('\nSIGUIENTE PASO: si deseas probar una venta legacy, hazla antes del plan de migración.');
    console.log('Luego ejecuta stock:legacy --mode=plan para la bodega principal.');
  } catch (error) {
    // No borrar PENDING: no se puede presumir que el commit no ocurrió.
    console.error('Operación detenida. Se conserva comprobante PENDING para revisión manual.');
    throw error;
  }
}

async function main() {
  const args = parseFixtureArgs(process.argv.slice(2));
  // CLI independiente de Nest: carga DATABASE_URL desde .env sin reemplazar variables del proceso.
  loadEnvironment();
  const identity = assertTestDatabaseEnvironment(process.env, args.allowRemote);
  console.log('MODO ENSAYO LEGACY | Base: ' + identity.database + ' @ ' + identity.host);
  console.log('Run ID: ' + args.runId + ' | Modo: ' + args.mode);
  const db = new PrismaClient();
  try {
    if (args.mode === 'inspect') return await inspectReceipt(db, args);
    if (args.mode === 'preview') {
      const ctx = await readContext(db, args);
      printPreview(ctx, args);
      console.log('Sólo vista previa: no hubo INSERT ni UPDATE.');
      return;
    }
    await applyFixture(db, args);
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module) {
  void main().catch(error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });
}
