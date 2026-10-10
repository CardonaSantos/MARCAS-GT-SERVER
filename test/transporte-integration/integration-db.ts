import { PrismaClient } from '@prisma/client';

function assertLocalDatabaseUrl(rawUrl: string): string {
  const value = rawUrl.trim().replace(/^["']|["']$/g, '');

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'TEST_DATABASE_URL no tiene un formato PostgreSQL válido.',
    );
  }

  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      'La integración de Transporte solo puede ejecutarse contra PostgreSQL local.',
    );
  }

  return value;
}

export function requireIntegrationDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL es obligatoria durante la ejecución de los tests de integración.',
    );
  }

  return assertLocalDatabaseUrl(testUrl);
}

export function createIntegrationPrisma(): PrismaClient {
  const url = requireIntegrationDatabaseUrl();

  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}
