import { PrismaClient } from '@prisma/client';

export function requireIntegrationDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      [
        'TEST_DATABASE_URL no está definida.',
        'Esta suite requiere una base PostgreSQL de pruebas aislada.',
        'Ejemplo:',
        '$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marcas_test?schema=public"',
      ].join('\n'),
    );
  }

  const current = process.env.DATABASE_URL?.trim();

  if (current && normalize(current) === normalize(url)) {
    throw new Error(
      'TEST_DATABASE_URL no puede ser igual a DATABASE_URL. Se rechazó la ejecución por seguridad.',
    );
  }

  if (!/test/i.test(url)) {
    throw new Error(
      [
        'TEST_DATABASE_URL debe contener la palabra "test" en el nombre de BD o schema.',
        'Ejemplos seguros:',
        '  .../marcas_test?schema=public',
        '  .../marcas?schema=despachos_test',
      ].join('\n'),
    );
  }

  return url;
}

export function createIntegrationPrisma(): PrismaClient {
  const url = requireIntegrationDatabaseUrl();

  return new PrismaClient({
    datasources: {
      db: { url },
    },
    log:
      process.env.INTEGRATION_PRISMA_LOG === '1'
        ? ['error', 'warn']
        : ['error'],
  });
}

function normalize(value: string): string {
  return value.replace(/\/+$/, '');
}
