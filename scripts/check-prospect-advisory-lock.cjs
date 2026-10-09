/* Runtime regression: Prisma must decode the lock query and PostgreSQL must hold it. */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const owner = new PrismaClient();
  const observer = new PrismaClient();
  const actorId = 762;
  try {
    await owner.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(${actorId}::int, 907112) IS NULL AS lock_evaluated
      `;
      if (rows.length !== 1 || typeof rows[0].lock_evaluated !== "boolean") {
        throw new Error("The advisory lock query must return a supported boolean column.");
      }

      const competing = await observer.$queryRaw`
        SELECT pg_try_advisory_xact_lock(${actorId}::int, 907112) AS acquired
      `;
      if (competing[0]?.acquired !== false) {
        throw new Error("The transaction did not retain the exclusive advisory lock.");
      }
    });

    const afterCommit = await observer.$queryRaw`
      SELECT pg_try_advisory_xact_lock(${actorId}::int, 907112) AS acquired
    `;
    if (afterCommit[0]?.acquired !== true) {
      throw new Error("Advisory lock was not released at transaction commit.");
    }
    console.log("PostgreSQL and Prisma advisory lock integration: passed.");
  } finally {
    await Promise.all([owner.$disconnect(), observer.$disconnect()]);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
