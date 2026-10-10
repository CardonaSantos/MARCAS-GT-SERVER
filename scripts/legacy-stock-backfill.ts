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
const txOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 120_000,
  maxWait: 10_000,
};
type Tx = Prisma.TransactionClient;
const serializableLock = async (tx: Tx) => {
  // Evita dos ejecuciones del mismo CLI en paralelo dentro de una base.
  await tx.$queryRawUnsafe('SELECT 1 AS "locked" FROM pg_advisory_xact_lock(472641, 1)');
};

function parseArgs(): { mode: Mode; warehouseId: number; file: string; confirm?: string } {
  const values: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(raw);
    if (!match || !["mode", "warehouse-id", "file", "confirm"].includes(match[1]) || values[match[1]]) {
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
  return { mode: mode as Mode, warehouseId, file: resolve(values.file), confirm: values.confirm };
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

async function loadVerifiedSales(db: Tx | PrismaClient, plan: Plan) {
  const sales = await salesSnapshot(db);
  if (sha(sales) !== sha(plan.sales)) throw new Error(
    "El historial de ventas legacy cambió desde el plan. Operación bloqueada.");
}

async function assertReadyRowsUnchanged(tx: Tx, plan: Plan) {
  const items = plan.rows.filter(r => r.status === "READY");
  for (const row of items) {
    // Bloqueo exclusivo del origen; obliga a coordinar con escrituras legacy.
    await tx.$queryRawUnsafe('SELECT "id" FROM "Stock" WHERE "id" = $1 FOR UPDATE', row.stockId);
    const source = await tx.stock.findUnique({ where: { id: row.stockId }, include: { producto: true } });
    assertCandidateCurrent(row, source);
  }
  return items;
}

async function applyPlan(plan: Plan) {
  const result = await prisma.$transaction(async tx => {
    await serializableLock(tx);
    const warehouse = await assertTarget(tx, plan.warehouse.id);
    if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("La empresa destino cambió.");
    await loadVerifiedSales(tx, plan);
    const rows = await assertReadyRowsUnchanged(tx, plan);
    // No aceptar cambios en los omitidos: requieren conciliarse aparte si se alteraron.
    let inserted = 0, repeated = 0;
    for (const row of rows) {
      const key = movementKey(plan.warehouse.id, row.stockId);
      const [existing, rollback] = await Promise.all([
        tx.movimientoInventario.findUnique({ where: { claveIdempotencia: key } }),
        tx.movimientoInventario.findUnique({ where: { claveIdempotencia: undoKey(plan.warehouse.id, row.stockId) } }),
      ]);
      if (rollback) throw new Error("Ya se revirtió este producto; no se puede reimportar: " + row.sku);
      if (existing) {
        if (existing.productoId !== row.productoId || existing.bodegaId !== plan.warehouse.id ||
            existing.cantidad !== row.cantidad || existing.tipo !== "MIGRACION_INICIAL") {
          throw new Error("Clave idempotente vinculada a otro movimiento: " + row.sku);
        }
        repeated++;
        continue;
      }
      const existingInventory = await tx.stockBodega.findFirst({ where: { productoId: row.productoId } });
      if (existingInventory) throw new Error(
        "El producto ya tiene un StockBodega; requiere conciliación: " + row.sku);
      const movementOfProduct = await tx.movimientoInventario.count({ where: { productoId: row.productoId } });
      if (movementOfProduct > 0) throw new Error("El producto tiene movimientos previos: " + row.sku);
      const stock = await tx.stockBodega.create({
        data: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          cantidadReal: row.cantidad, cantidadReservada: 0, cantidadDisponible: row.cantidad,
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
          claveIdempotencia: key,
          observaciones: "Importación inicial legacy; lote " + fixedBatchId +
            "; registro Stock #" + row.stockId + ". Origen no modificado.",
        },
      });
      inserted++;
    }
    return { inserted, repeated, total: rows.length };
  }, txOptions);
  console.log("APLICACIÓN ATÓMICA: " + JSON.stringify(result) +
    ". Si se produjo una excepción, PostgreSQL revirtió todo este intento.");
}

async function verifyPlan(plan: Plan) {
  const warehouse = await assertTarget(prisma, plan.warehouse.id);
  if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("Empresa de destino distinta");
  const sales = await salesSnapshot(prisma);
  const salesMatch = sha(sales) === sha(plan.sales);
  const rows = plan.rows.filter(r => r.status === "READY");
  const results: Record<string, number> = {};
  const problems: string[] = [];
  for (const row of rows) {
    const migrated = await prisma.movimientoInventario.findUnique({
      where: { claveIdempotencia: movementKey(plan.warehouse.id, row.stockId) },
    });
    const undone = await prisma.movimientoInventario.findUnique({
      where: { claveIdempotencia: undoKey(plan.warehouse.id, row.stockId) },
    });
    const stock = await prisma.stockBodega.findUnique({
      where: { bodegaId_productoId: { bodegaId: plan.warehouse.id, productoId: row.productoId } },
    });
    const state = undone ? "ROLLED_BACK" : migrated ? "APPLIED" : "NOT_APPLIED";
    results[state] = (results[state] ?? 0) + 1;
    if (migrated && (migrated.productoId !== row.productoId || migrated.cantidad !== row.cantidad)) {
      problems.push("Movimiento inconsistente: " + row.sku);
    }
    if (state === "APPLIED" && !stock) problems.push("StockBodega desaparecido: " + row.sku);
    if (state === "ROLLED_BACK" && stock && stock.cantidadReal < 0) problems.push("Cantidad inválida: " + row.sku);
  }
  console.log(JSON.stringify({
    warehouse, candidates: rows.length, results, legacySalesUnchanged: salesMatch,
    salesAtPlan: plan.sales, salesNow: sales, problems,
  }, null, 2));
  if (!salesMatch) throw new Error("DIFERENCIA en el historial de ventas legacy (no modificada por el script)");
  if (problems.length) throw new Error("Hay inconsistencias en la verificación");
}

async function rollbackPlan(plan: Plan) {
  const result = await prisma.$transaction(async tx => {
    await serializableLock(tx);
    const warehouse = await assertTarget(tx, plan.warehouse.id);
    if (warehouse.empresaId !== plan.warehouse.empresaId) throw new Error("Empresa de destino distinta.");
    const rows = await assertReadyRowsUnchanged(tx, plan);
    let reversed = 0, repeated = 0;
    for (const row of rows) {
      const originalKey = movementKey(plan.warehouse.id, row.stockId);
      const rollbackKey = undoKey(plan.warehouse.id, row.stockId);
      const migration = await tx.movimientoInventario.findUnique({ where: { claveIdempotencia: originalKey } });
      const existingUndo = await tx.movimientoInventario.findUnique({ where: { claveIdempotencia: rollbackKey } });
      if (existingUndo) { repeated++; continue; }
      if (!migration) continue; // lote no aplicado a este producto
      if (migration.tipo !== "MIGRACION_INICIAL" || migration.productoId !== row.productoId ||
          migration.cantidad !== row.cantidad) throw new Error("Movimiento original no coincide: " + row.sku);
      const stock = await tx.stockBodega.findUnique({
        where: { bodegaId_productoId: { bodegaId: plan.warehouse.id, productoId: row.productoId } },
      });
      if (!stock || stock.version !== 1 || stock.cantidadReal !== row.cantidad ||
          stock.cantidadReservada !== 0 || stock.cantidadDisponible !== row.cantidad) {
        throw new Error("NO REVERSIBLE: stock modificado tras migración: " + row.sku);
      }
      const laterMovements = await tx.movimientoInventario.count({
        where: { productoId: row.productoId, id: { not: migration.id } },
      });
      if (laterMovements) throw new Error("NO REVERSIBLE: movimientos posteriores en: " + row.sku);
      const updated = await tx.stockBodega.updateMany({
        where: { id: stock.id, version: 1, cantidadReal: row.cantidad, cantidadReservada: 0 },
        data: {
          cantidadReal: 0, cantidadReservada: 0, cantidadDisponible: 0,
          costoPromedio: new Prisma.Decimal(0), version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("Stock cambió concurrentemente: " + row.sku);
      await tx.movimientoInventario.create({
        data: {
          bodegaId: plan.warehouse.id, productoId: row.productoId,
          proveedorId: null, creadoPorId: null, reservaInventarioId: null,
          tipo: "AJUSTE_SALIDA", cantidad: row.cantidad,
          costoUnitario: row.costoUnitario,
          costoPromedioAntes: stock.costoPromedio, costoPromedioDespues: new Prisma.Decimal(0),
          cantidadRealAntes: row.cantidad, cantidadRealDespues: 0,
          reservadaAntes: 0, reservadaDespues: 0,
          referenciaTipo: "STOCK_LEGACY_ROLLBACK", referenciaId: row.stockId,
          claveIdempotencia: rollbackKey,
          observaciones: "Reversión auditada del lote " + fixedBatchId + "; movimiento #" + migration.id,
        },
      });
      reversed++;
    }
    return { reversed, repeated };
  }, txOptions);
  console.log("REVERSIÓN ATÓMICA Y AUDITADA: " + JSON.stringify(result));
  console.log("Los movimientos del kardex permanecen como evidencia. No se alteró Stock legacy.");
}

async function main() {
  const options = parseArgs();
  prisma = new PrismaClient();
  console.log("Base de destino: " + (process.env.DATABASE_URL ? "DATABASE_URL configurada" : "NO CONFIGURADA"));
  console.log("Modo: " + options.mode + "; bodega esperada: " + options.warehouseId);
  if (options.mode === "plan") return generatePlan(options.warehouseId, options.file);
  const plan = loadPlan(options.file, options.warehouseId);
  if (options.mode === "apply") return applyPlan(plan);
  if (options.mode === "rollback") return rollbackPlan(plan);
  return verifyPlan(plan);
}

if (require.main === module) {
  void main().catch(error => {
    console.error("OPERACIÓN DETENIDA (no se debe continuar a ciegas):", error.message);
    process.exitCode = 1;
  }).finally(() => prisma?.$disconnect());
}
