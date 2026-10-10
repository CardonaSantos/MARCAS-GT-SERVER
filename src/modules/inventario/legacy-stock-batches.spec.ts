import { parseArgs, splitReadyBatches, movementKey, undoKey } from "../../../scripts/legacy-stock-backfill";

const row = (stockId: number, status: "READY" | "ZERO" = "READY") => ({
  stockId, status, productoId: stockId, cantidad: 3,
});

describe("Legacy Stock Backfill por lotes", () => {
  it("divide los 840 candidatos en 34 transacciones de 25", () => {
    const batches = splitReadyBatches(
      Array.from({ length: 840 }, (_, i) => row(i + 1)), 25,
    );
    expect(batches).toHaveLength(34);
    expect(batches[0]).toHaveLength(25);
    expect(batches[33]).toHaveLength(15);
    expect(batches.flat().map(item => item.stockId)).toEqual(
      Array.from({ length: 840 }, (_, i) => i + 1),
    );
  });

  it("omite los productos ZERO y ordena de manera determinista", () => {
    const source = [row(8), row(1), row(3, "ZERO"), row(5), row(2)];
    const batches = splitReadyBatches(source, 2);
    expect(batches.map(part => part.map(item => item.stockId)))
      .toEqual([[1, 2], [5, 8]]);
    expect(source.map(item => item.stockId)).toEqual([8, 1, 3, 5, 2]);
  });

  it("admite lotes menores al reanudar sin alterar claves de idempotencia", () => {
    const original = Array.from({ length: 18 }, (_, i) => row(i + 1));
    const first = splitReadyBatches(original, 25).flat()
      .map(item => movementKey(1, item.stockId));
    const resumed = splitReadyBatches(original, 5).flat()
      .map(item => movementKey(1, item.stockId));
    expect(resumed).toEqual(first);
    for (const item of original) {
      expect(movementKey(1, item.stockId))
        .not.toEqual(undoKey(1, item.stockId));
    }
  });

  it("valida batch-size y requiere confirmación igual que antes", () => {
    const args = [
      "--mode=apply", "--warehouse-id=1",
      "--file=migration-reports/existing.json", "--confirm=LEGACY_STOCK_V1",
    ];
    expect(parseArgs(args).batchSize).toBe(25);
    expect(parseArgs([...args, "--batch-size=5"]).batchSize).toBe(5);
    for (const invalid of ["0", "-1", "51", "1.5", "abc"]) {
      expect(() => parseArgs([...args, "--batch-size=" + invalid])).toThrow();
    }
    expect(() => parseArgs(args.filter(x => !x.startsWith("--confirm")))).toThrow();
    expect(() => parseArgs([...args, "--batch-size=25", "--batch-size=25"])).toThrow();
  });
});
