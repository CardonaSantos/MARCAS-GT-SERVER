/**
 * Backfill manual de Stock (legacy) a StockBodega (inventario nuevo).
 *
 * No altera Stock, Venta, VentaProducto, EntregaStock ni saldos financieros.
 * Ejecutar EXCLUSIVAMENTE con las escrituras legacy deshabilitadas y un backup comprobado.
 * El plan es un archivo local de trabajo: nunca publicarlo en Git.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

type Mode = "plan" | "apply" | "verify" | "rollback";
type Status =
  | "READY" | "ZERO" | "NEGATIVE" | "EXISTS_IN_NEW_INVENTORY"
  | "COST_INVALID" | "PRODUCT_MISSING";

type SourceRow = {
  stockId: number;
  productoId: number;
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitario: string | null;
  proveedorId: number | null;
  costoTotalLegacy: number;
  stockActualizadoEn: string;
  productoActualizadoEn: string;
  status: Status;
};
type Audit = { count: number; sha256: string };
type LegacySalesSnapshot = { ventas: Audit; lineas: Audit };
type Plan = {
  schemaVersion: 1;
  batchId: string;
  createdAt: string;
  warehouse: { id: number; empresaId: number; nombre: string };
  sales: LegacySalesSnapshot;
  rows: SourceRow[];
  seal: string;
};

let prisma: PrismaClient;
const planVersion = 1;
const fixedBatchId = "LEGACY_STOCK_V1";
const maxBatchSize = 50;
const defaultBatchSize = 25;
const txOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 60_000,
  maxWait: 15_000,
};
type Tx = Prisma.TransactionClient;
const serializableLock = async (tx: Tx) => {
  // Evita dos ejecuciones del mismo CLI en paralelo dentro de una base.
  await tx.$queryRawUnsafe('SELECT 1 AS "locked" FROM pg_advisory_xact_lock(472641, 1)');
};

export function parseArgs(args: string[] = process.argv.slice(2)): { mode: Mode; warehouseId: number; file: string; confirm?: string; batchSize: number } {
  const values: Record<string, string> = {};
  for (const raw of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(raw);
    if (!match || !["mode", "warehouse-id", "file", "confirm", "batch-size"].includes(match[1]) || values[match[1]]) {
      throw new Error("Argumento inválido o repetido: " + raw);
    }
    values[match[1]] = match[2];
  }
  const mode = values.mode;
  if (!["plan", "apply", "verify", "rollback"].includes(mode)) {
    throw new Error("Usa --mode=plan|apply|verify|rollback");
  }
  const warehouseId = Number(values["warehouse-id"] ?? "1");
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
    throw new Error("--warehouse-id debe ser un entero positivo");
  }
  if (!values.file) throw new Error("--file=RUTA.json es obligatorio");
  if ((mode === "apply" || mode === "rollback") && values.confirm !== fixedBatchId) {
    throw new Error("Operación bloqueada. Se requiere --confirm=" + fixedBatchId);
  }
  const batchSize = Number(values["batch-size"] ?? defaultBatchSize);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > maxBatchSize) {
    throw new Error("--batch-size debe estar entre 1 y " + maxBatchSize);
  }
  return { mode: mode as Mode, warehouseId, file: resolve(values.file), confirm: values.confirm, batchSize };
}

function sha(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
export function seal(plan: Omit<Plan, "seal">): string { return sha(plan); }

function loadPlan(filename: string, warehouseId: number): Plan {
  const plan = JSON.parse(readFileSync(filename, "utf8")) as Plan;
  const { seal: originalSeal, ...body } = plan;
  if (plan.schemaVersion !== planVersion || plan.batchId !== fixedBatchId ||
      plan.warehouse?.id !== warehouseId || !Array.isArray(plan.rows) ||
      originalSeal !== seal(body)) {
    throw new Error("Plan alterado, incompatible o de otra bodega. Genera un plan nuevo.");
  }
  const unique = new Set<number>();
  for (const row of plan.rows) {
    if (!Number.isSafeInteger(row.stockId) || unique.has(row.stockId)) {
      throw new Error("El plan contiene IDs de Stock duplicados o inválidos");
    }
    unique.add(row.stockId);
  }
  return plan;
}

export function movementKey(bodegaId: number, stockId: number): string {
  return "LEGACY_STOCK:V1:BODEGA:" + bodegaId + ":STOCK:" + stockId;
}
export function undoKey(bodegaId: number, stockId: number): string {
  return "LEGACY_STOCK:V1:ROLLBACK:BODEGA:" + bodegaId + ":STOCK:" + stockId;
}
export function strictMoney(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 9999999999) return null;
  // Costo de Producto es Float en legacy, StockBodega es DECIMAL(14,4).
  return new Prisma.Decimal(value.toFixed(4)).toFixed(4);
}
export function assertCandidateCurrent(saved: SourceRow, current: {
  id: number; productoId: number; cantidad: number; proveedorId: number | null;
  costoTotal: number; actualizadoEn: Date;
  producto: { codigoProducto: string; nombre: string; costo: number | null; actualizadoEn: Date };
} | null): void {
  if (!current || saved.stockId !== current.id ||
      saved.productoId !== current.productoId ||
      saved.cantidad !== current.cantidad ||
      saved.proveedorId !== current.proveedorId ||
      saved.costoTotalLegacy !== current.costoTotal ||
      saved.stockActualizadoEn !== current.actualizadoEn.toISOString() ||
      saved.productoActualizadoEn !== current.producto.actualizadoEn.toISOString() ||
      saved.costoUnitario !== strictMoney(current.producto.costo) ||
      saved.sku !== current.producto.codigoProducto) {
    throw new Error("Stock legacy cambió desde el plan: Stock #" + saved.stockId +
      ". Detén la migración y crea un plan nuevo.");
  }
}

async function assertTarget(db: Tx | PrismaClient, warehouseId: number) {
  const [mainCount, warehouse, companyCount] = await Promise.all([
    db.bodega.count({ where: { esPrincipal: true } }),
    db.bodega.findUnique({ where: { id: warehouseId } }),
    db.empresa.count(),
  ]);
  if (companyCount !== 1) throw new Error(
    "Stock legacy no tiene empresaId; se exige exactamente una empresa en esta base.");
  if (!warehouse || !warehouse.activo || !warehouse.esPrincipal || mainCount !== 1) {
    throw new Error("La bodega #" + warehouseId + " debe estar activa y ser la única principal.");
  }
  return { id: warehouse.id, empresaId: warehouse.empresaId, nombre: warehouse.nombre };
}

/** Hash estable del historial legacy: se genera por lotes para no cargar toda la BD. */
async function salesSnapshot(db: Tx | PrismaClient): Promise<LegacySalesSnapshot> {
  const salesHash = createHash("sha256");
  const linesHash = createHash("sha256");
  let salesCount = 0;
  let linesCount = 0;
  let lastSaleId = 0;
  let lastLineId = 0;
  while (true) {
    const records = await db.venta.findMany({
      where: { id: { gt: lastSaleId } },
      orderBy: { id: "asc" }, take: 500,
      select: {
        id: true, monto: true, montoConDescuento: true, descuento: true,
        metodoPago: true, referenciaPago: true, clienteId: true, usuarioId: true,
        timestamp: true,
      },
    });
    if (!records.length) break;
    for (const r of records) { salesHash.update(JSON.stringify(r) + "\n"); salesCount++; }
    lastSaleId = records[records.length - 1].id;
  }
  while (true) {
    const records = await db.ventaProducto.findMany({
      where: { id: { gt: lastLineId } },
      orderBy: { id: "asc" }, take: 500,
      select: { id: true, ventaId: true, productoId: true, cantidad: true, precio: true, creadoEn: true },
    });
    if (!records.length) break;
    for (const r of records) { linesHash.update(JSON.stringify(r) + "\n"); linesCount++; }
    lastLineId = records[records.length - 1].id;
  }
  return {
    ventas: { count: salesCount, sha256: salesHash.digest("hex") },
    lineas: { count: linesCount, sha256: linesHash.digest("hex") },
  };
}

function summarize(rows: SourceRow[]) {
  const statuses = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1; return acc;
  }, {});
  const ready = rows.filter(row => row.status === "READY");
  return { stockRows: rows.length, statuses, importableProducts: ready.length,
    importableUnits: ready.reduce((sum, row) => sum + row.cantidad, 0) };
}

async function generatePlan(warehouseId: number, filename: string) {
  if (existsSync(filename)) throw new Error("El archivo del plan ya existe: " + filename +
    ". Elige otro nombre para no sobrescribir evidencia.");
  const plan = await prisma.$transaction(async tx => {
    await serializableLock(tx);
    const warehouse = await assertTarget(tx, warehouseId);
    const records = await tx.stock.findMany({
      orderBy: { id: "asc" }, include: { producto: true },
    });
    const existing = await tx.stockBodega.findMany({
      select: { productoId: true }, distinct: ["productoId"],
    });
    const hasNewStock = new Set(existing.map(row => row.productoId));
    const rows: SourceRow[] = records.map(stock => {
      const product = stock.producto;
      const cost = strictMoney(product?.costo);
      let status: Status = "READY";
      if (!product) status = "PRODUCT_MISSING";
      else if (!Number.isSafeInteger(stock.cantidad) || stock.cantidad < 0) status = "NEGATIVE";
      else if (stock.cantidad === 0) status = "ZERO";
      else if (hasNewStock.has(stock.productoId)) status = "EXISTS_IN_NEW_INVENTORY";
      else if (cost == null) status = "COST_INVALID";
      return {
        stockId: stock.id, productoId: stock.productoId,
        sku: product?.codigoProducto ?? "", nombre: product?.nombre ?? "",
        cantidad: stock.cantidad, costoUnitario: cost,
        proveedorId: stock.proveedorId, costoTotalLegacy: stock.costoTotal,
        stockActualizadoEn: stock.actualizadoEn.toISOString(),
        productoActualizadoEn: product?.actualizadoEn?.toISOString() ?? "",
        status,
      };
    });
    const body: Omit<Plan, "seal"> = {
      schemaVersion: 1, batchId: fixedBatchId, createdAt: new Date().toISOString(),
      warehouse, sales: await salesSnapshot(tx), rows,
    };
    return { ...body, seal: seal(body) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 });
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
  console.log("PLAN CREADO (sin escrituras de inventario): " + filename);
  console.log(JSON.stringify(summarize(plan.rows), null, 2));
  console.log("Ventas legacy: " + plan.sales.ventas.count + ", líneas: " + plan.sales.lineas.count);
  console.log("Revisa las filas omitidas antes de aplicar.");
}

/** Tamaño acotado de los lotes: cada lote confirma su propia transacción. */
export function splitReadyBatches<T extends { stockId: number; status: Status }>(
  rows: T[], size: number,
): T[][] {
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBatchSize) {
    throw new Error("Tamaño de lote fuera del rango 1.." + maxBatchSize);
  }
  const ready = rows.filter(r => r.status === "READY").sort((a,b) => a.stockId - b.stockId);
  const batches: T[][] = [];
  for (let i=0;i<ready.length;i+=size) batches.push(ready.slice(i,i+size));
  return batches;
}

async function loadVerifiedSales(db: Tx | PrismaClient, plan: Plan) {
  const sales = await salesSnapshot(db);
  if (sha(sales) !== sha(plan.sales)) throw new Error(
    "El historial de ventas legacy cambió desde el plan. Operación bloqueada.");
}

async function assertReadyRowsUnchanged(tx: Tx, rows: SourceRow[]) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.stockId);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Stock" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
  const sources = await tx.stock.findMany({
    where: { id: { in: ids } }, include: { producto: true },
  });
  const byId = new Map(sources.map(row => [row.id, row]));
  for (const row of rows) assertCandidateCurrent(row, byId.get(row.stockId) ?? null);
  return rows;
}

function validateImport(row: SourceRow, current: {
  tipo: string; productoId: number; bodegaId: number; cantidad: number;
  referenciaTipo: string | null; referenciaId: number | null;
}, warehouseId: number) {
  if (current.tipo !== "MIGRACION_INICIAL" || current.productoId !== row.productoId ||
      current.bodegaId !== warehouseId || current.cantidad !== row.cantidad ||
      current.referenciaTipo !== "STOCK_LEGACY" || current.referenciaId !== row.stockId) {
    throw new Error("Movimiento existente incompatible con el plan: " + row.sku);
  }
}

async function existingKeys(db: Tx | PrismaClient, rows: SourceRow[], warehouseId: number) {
  if (!rows.length) return [];
  return db.movimientoInventario.findMany({
    where: { claveIdempotencia: { in: rows.flatMap(row => [
      movementKey(warehouseId, row.stockId), undoKey(warehouseId, row.stockId),
    ]) } },
  });
}

async function assertNoNewInventory(db: Tx | PrismaClient, rows: SourceRow[]) {
  if (!rows.length) return;
  const ids = rows.map(r => r.productoId);
  const [stocks, movements] = await Promise.all([
    db.stockBodega.findMany({
      where: { productoId: { in: ids } }, select: { productoId: true },
    }),
    db.movimientoInventario.findMany({
      where: { productoId: { in: ids } }, select: { productoId: true },
      distinct: ["productoId"],
    }),
  ]);
  const conflicts = new Set([...stocks, ...movements].map(item => item.productoId));
  const conflict = rows.find(row => conflicts.has(row.productoId));
  if (conflict) throw new Error("Inventario nuevo ya contiene " + conflict.sku +
    " y no fue importado por este plan. Conciliar antes de continuar.");
}

/** Preflight global antes de confirmar cualquier lote. */
async function preflightApply(plan: Plan, batches: SourceRow[][]) {
  const warehouse = await assertTarget(prisma, plan.warehouse.id);
  if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("La empresa destino cambió.");
  await loadVerifiedSales(prisma, plan);
  const rows = batches.flat();
  const sources = await prisma.stock.findMany({
    where: { id: { in: rows.map(r => r.stockId) } }, include: { producto: true },
  });
  const byId = new Map(sources.map(row => [row.id, row]));
  for (const row of rows) assertCandidateCurrent(row, byId.get(row.stockId) ?? null);
  const keyed = new Map((await existingKeys(prisma, rows, plan.warehouse.id))
    .map(item => [item.claveIdempotencia, item]));
  const pending: SourceRow[] = [];
  for (const row of rows) {
    const original = keyed.get(movementKey(plan.warehouse.id, row.stockId));
    const undone = keyed.get(undoKey(plan.warehouse.id, row.stockId));
    if (undone) throw new Error("Ya se revirtió este producto: " + row.sku);
    if (original) validateImport(row, original, plan.warehouse.id);
    else pending.push(row);
  }
  await assertNoNewInventory(prisma, pending);
  const imported = rows.filter(row =>
    keyed.has(movementKey(plan.warehouse.id, row.stockId)));
  if (imported.length) {
    const stocks = await prisma.stockBodega.findMany({
      where: {
        bodegaId: plan.warehouse.id,
        productoId: { in: imported.map(row => row.productoId) },
      },
      select: { productoId: true },
    });
    const stockIds = new Set(stocks.map(item => item.productoId));
    const missing = imported.find(row => !stockIds.has(row.productoId));
    if (missing) throw new Error("Movimiento importado sin StockBodega: " + missing.sku);
  }
  console.log("PRECHECK OK: ventas, origen y duplicados revisados; pendientes " +
    pending.length + ", previamente importados " + (rows.length - pending.length) + ".");
}

async function applyBatch(plan: Plan, rows: SourceRow[]) {
  return prisma.$transaction(async tx => {
    await serializableLock(tx);
    const warehouse = await assertTarget(tx, plan.warehouse.id);
    if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("La empresa destino cambió.");
    await assertReadyRowsUnchanged(tx, rows);
    await loadVerifiedSales(tx, plan);
    const keyed = new Map((await existingKeys(tx, rows, plan.warehouse.id))
      .map(item => [item.claveIdempotencia, item]));
    const pending: SourceRow[] = [];
    let repeated = 0;
    for (const row of rows) {
      const original = keyed.get(movementKey(plan.warehouse.id, row.stockId));
      if (keyed.has(undoKey(plan.warehouse.id, row.stockId))) {
        throw new Error("Producto revertido; no se permite reimportar: " + row.sku);
      }
      if (original) { validateImport(row, original, plan.warehouse.id); repeated++; }
      else pending.push(row);
    }
    await assertNoNewInventory(tx, pending);
    for (const row of pending) {
      const stock = await tx.stockBodega.create({
        data: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          cantidadReal: row.cantidad, cantidadReservada: 0,
          cantidadDisponible: row.cantidad,
          costoPromedio: row.costoUnitario!, version: 1,
        },
      });
      await tx.movimientoInventario.create({
        data: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          proveedorId: row.proveedorId, creadoPorId: null,
          reservaInventarioId: null, tipo: "MIGRACION_INICIAL",
          cantidad: row.cantidad, costoUnitario: row.costoUnitario,
          costoPromedioAntes: new Prisma.Decimal(0), costoPromedioDespues: stock.costoPromedio,
          cantidadRealAntes: 0, cantidadRealDespues: row.cantidad,
          reservadaAntes: 0, reservadaDespues: 0,
          referenciaTipo: "STOCK_LEGACY", referenciaId: row.stockId,
          claveIdempotencia: movementKey(plan.warehouse.id, row.stockId),
          observaciones: "Importación inicial legacy; lote " + fixedBatchId +
            "; registro Stock #" + row.stockId + ". Origen no modificado.",
        },
      });
    }
    return { inserted: pending.length, repeated, total: rows.length };
  }, txOptions);
}

async function applyPlan(plan: Plan, batchSize: number) {
  const batches = splitReadyBatches(plan.rows, batchSize);
  await preflightApply(plan, batches);
  let inserted = 0, repeated = 0;
  console.log("INICIO: " + batches.length + " lotes de hasta " + batchSize +
    " productos. Cada lote se confirma de forma independiente.");
  for (const [index, rows] of batches.entries()) {
    try {
      const result = await applyBatch(plan, rows);
      inserted += result.inserted;
      repeated += result.repeated;
      console.log("Lote " + (index + 1) + "/" + batches.length +
        " CONFIRMADO: nuevos " + result.inserted + ", repetidos " + result.repeated +
        "; " + (inserted + repeated) + "/" + batches.reduce((sum, part) => sum + part.length, 0));
    } catch (error) {
      console.error("FALLO en lote " + (index + 1) + "/" + batches.length +
        ". Los lotes anteriores permanecen confirmados.");
      console.error("Ejecuta --mode=verify y reanuda con el MISMO plan y comando.");
      throw error;
    }
  }
  await loadVerifiedSales(prisma, plan);
  console.log("APLICACIÓN COMPLETADA: " + JSON.stringify({
    inserted, repeated, total: inserted + repeated,
  }));
  console.log("Ejecuta --mode=verify antes de habilitar operaciones nuevas.");
}

async function verifyPlan(plan: Plan) {
  const warehouse = await assertTarget(prisma, plan.warehouse.id);
  if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("Empresa de destino distinta.");
  const sales = await salesSnapshot(prisma);
  const salesMatch = sha(sales) === sha(plan.sales);
  const rows = plan.rows.filter(r => r.status === "READY");
  const results: Record<string, number> = {};
  const problems: string[] = [];
  const size = 100;
  for (let start = 0; start < rows.length; start += size) {
    const part = rows.slice(start, start + size);
    const [movementRows, stocks] = await Promise.all([
      existingKeys(prisma, part, plan.warehouse.id),
      prisma.stockBodega.findMany({
        where: { bodegaId: plan.warehouse.id, productoId: { in: part.map(r => r.productoId) } },
      }),
    ]);
    const movements = new Map(movementRows.map(r => [r.claveIdempotencia, r]));
    const byProduct = new Map(stocks.map(r => [r.productoId, r]));
    for (const row of part) {
      const original = movements.get(movementKey(plan.warehouse.id, row.stockId));
      const undo = movements.get(undoKey(plan.warehouse.id, row.stockId));
      const stock = byProduct.get(row.productoId);
      const state = undo ? "ROLLED_BACK" : original ? "APPLIED" : "NOT_APPLIED";
      results[state] = (results[state] ?? 0) + 1;
      if (undo && !original) problems.push("Reversión sin importación: " + row.sku);
      if (original) {
        try { validateImport(row, original, plan.warehouse.id); }
        catch (error) { problems.push((error as Error).message); }
      }
      if (state === "NOT_APPLIED" && stock) {
        problems.push("Producto sin importación que ya tiene existencias nuevas: " + row.sku);
      }
      if (state === "APPLIED" && !stock) problems.push("StockBodega desapareció: " + row.sku);
      if (state === "APPLIED" && stock) {
        if (stock.cantidadReal < 0 || stock.cantidadReservada < 0 ||
            stock.cantidadDisponible !== stock.cantidadReal - stock.cantidadReservada) {
          problems.push("Invariante real/reservado/disponible inconsistente: " + row.sku);
        }
        if (stock.version === 1 &&
            (stock.cantidadReal !== row.cantidad || stock.cantidadReservada !== 0 ||
             stock.costoPromedio.toFixed(4) !== row.costoUnitario)) {
          problems.push("Stock importado no coincide con el plan: " + row.sku);
        }
      }
      if (state === "ROLLED_BACK" && (!stock || stock.cantidadReal < 0)) {
        problems.push("Stock revertido inválido: " + row.sku);
      }
    }
  }
  console.log(JSON.stringify({
    warehouse, candidates: rows.length, results, legacySalesUnchanged: salesMatch,
    salesAtPlan: plan.sales, salesNow: sales, problems,
  }, null, 2));
  if (!salesMatch) throw new Error("DIFERENCIA en el historial de ventas legacy.");
  if (problems.length) throw new Error("Hay inconsistencias en la verificación.");
}

type RollbackCandidate = { row: SourceRow; movementId: number };
async function inspectRollbackCandidates(
  db: Tx | PrismaClient, plan: Plan, rows: SourceRow[],
): Promise<{ pending: RollbackCandidate[]; repeated: number; absent: number }> {
  const keyed = new Map((await existingKeys(db, rows, plan.warehouse.id))
    .map(item => [item.claveIdempotencia, item]));
  const productIds = rows.map(row => row.productoId);
  const [stocks, movementCounts] = await Promise.all([
    db.stockBodega.findMany({
      where: { bodegaId: plan.warehouse.id, productoId: { in: productIds } },
    }),
    db.movimientoInventario.groupBy({
      by: ["productoId"], where: { productoId: { in: productIds } },
      _count: { _all: true },
    }),
  ]);
  const byProduct = new Map(stocks.map(stock => [stock.productoId, stock]));
  const counts = new Map(movementCounts.map(item => [item.productoId, item._count._all]));
  const pending: RollbackCandidate[] = [];
  let repeated = 0, absent = 0;
  for (const row of rows) {
    const original = keyed.get(movementKey(plan.warehouse.id, row.stockId));
    const undo = keyed.get(undoKey(plan.warehouse.id, row.stockId));
    if (!original && undo) throw new Error("Reversión sin movimiento inicial: " + row.sku);
    if (!original) { absent++; continue; }
    validateImport(row, original, plan.warehouse.id);
    if (undo) {
      if (undo.tipo !== "AJUSTE_SALIDA" || undo.productoId !== row.productoId ||
          undo.bodegaId !== plan.warehouse.id || undo.cantidad !== row.cantidad) {
        throw new Error("Reversión previa incompatible: " + row.sku);
      }
      repeated++; continue;
    }
    const stock = byProduct.get(row.productoId);
    if (!stock || stock.version !== 1 || stock.cantidadReal !== row.cantidad ||
        stock.cantidadReservada !== 0 || stock.cantidadDisponible !== row.cantidad ||
        stock.costoPromedio.toFixed(4) !== row.costoUnitario) {
      throw new Error("NO REVERSIBLE: stock modificado después de importar " + row.sku);
    }
    if (counts.get(row.productoId) !== 1) {
      throw new Error("NO REVERSIBLE: movimientos posteriores a la migración: " + row.sku);
    }
    pending.push({ row, movementId: original.id });
  }
  return { pending, repeated, absent };
}

async function rollbackBatch(plan: Plan, rows: SourceRow[]) {
  return prisma.$transaction(async tx => {
    await serializableLock(tx);
    const warehouse = await assertTarget(tx, plan.warehouse.id);
    if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("La empresa destino cambió.");
    await assertReadyRowsUnchanged(tx, rows);
    const state = await inspectRollbackCandidates(tx, plan, rows);
    for (const { row, movementId } of state.pending) {
      const updated = await tx.stockBodega.updateMany({
        where: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          version: 1, cantidadReal: row.cantidad, cantidadReservada: 0,
          cantidadDisponible: row.cantidad,
        },
        data: {
          cantidadReal: 0, cantidadReservada: 0, cantidadDisponible: 0,
          costoPromedio: new Prisma.Decimal(0), version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("Stock modificado durante rollback: " + row.sku);
      await tx.movimientoInventario.create({
        data: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          proveedorId: null, creadoPorId: null, reservaInventarioId: null,
          tipo: "AJUSTE_SALIDA", cantidad: row.cantidad,
          costoUnitario: row.costoUnitario,
          costoPromedioAntes: new Prisma.Decimal(row.costoUnitario!),
          costoPromedioDespues: new Prisma.Decimal(0),
          cantidadRealAntes: row.cantidad, cantidadRealDespues: 0,
          reservadaAntes: 0, reservadaDespues: 0,
          referenciaTipo: "STOCK_LEGACY_ROLLBACK", referenciaId: row.stockId,
          claveIdempotencia: undoKey(plan.warehouse.id, row.stockId),
          observaciones: "Reversión auditada del lote " + fixedBatchId +
            "; movimiento #" + movementId,
        },
      });
    }
    return { reversed: state.pending.length, repeated: state.repeated, absent: state.absent };
  }, txOptions);
}

async function rollbackPlan(plan: Plan, batchSize: number) {
  const batches = splitReadyBatches(plan.rows, batchSize);
  const warehouse = await assertTarget(prisma, plan.warehouse.id);
  if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("La empresa destino cambió.");
  // No se permite una reversión parcial previsible: primero se evalúa TODO el lote.
  await loadVerifiedSales(prisma, plan);
  const sourceRows = batches.flat();
  const sources = await prisma.stock.findMany({
    where: { id: { in: sourceRows.map(row => row.stockId) } }, include: { producto: true },
  });
  const sourcesById = new Map(sources.map(row => [row.id, row]));
  for (const row of sourceRows) assertCandidateCurrent(row, sourcesById.get(row.stockId) ?? null);
  await inspectRollbackCandidates(prisma, plan, sourceRows);
  console.log("PRECHECK DE ROLLBACK OK: sin reservas, despachos ni cambios en registros aplicados.");
  let reversed = 0, repeated = 0, absent = 0;
  for (const [index, rows] of batches.entries()) {
    try {
      const result = await rollbackBatch(plan, rows);
      reversed += result.reversed;
      repeated += result.repeated;
      absent += result.absent;
      console.log("Reversión lote " + (index + 1) + "/" + batches.length +
        " CONFIRMADA: -" + result.reversed + ", ya revertidos " + result.repeated +
        ", no importados " + result.absent);
    } catch (error) {
      console.error("FALLO al revertir lote " + (index + 1) +
        ". Los lotes anteriores quedaron compensados; ejecuta --mode=verify.");
      throw error;
    }
  }
  console.log("REVERSIÓN COMPLETADA: " + JSON.stringify({ reversed, repeated, absent }));
  console.log("Stock legacy y ventas no fueron modificados. Los movimientos permanecen auditados.");
}

async function main() {
  const options = parseArgs();
  prisma = new PrismaClient();
  console.log("Base de destino: " + (process.env.DATABASE_URL ? "DATABASE_URL configurada" : "NO CONFIGURADA"));
  console.log("Modo: " + options.mode + "; bodega esperada: " + options.warehouseId);
  if (options.mode === "plan") return generatePlan(options.warehouseId, options.file);
  const plan = loadPlan(options.file, options.warehouseId);
  if (options.mode === "apply") return applyPlan(plan, options.batchSize);
  if (options.mode === "rollback") return rollbackPlan(plan, options.batchSize);
  return verifyPlan(plan);
}

if (require.main === module) {
  void main().catch(error => {
    console.error("OPERACIÓN DETENIDA (no se debe continuar a ciegas):", error.message);
    process.exitCode = 1;
  }).finally(() => prisma?.$disconnect());
}
