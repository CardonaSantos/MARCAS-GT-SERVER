import { PrismaClient } from '@prisma/client';

function databaseIdentity(raw: string): string {
  const value = raw.trim().replace(/^["']|["']$/g, '');

  try {
    const url = new URL(value);
    const schema = url.searchParams.get('schema') ?? 'public';
    const port = url.port || '5432';

    return [
      url.protocol.toLowerCase(),
      url.hostname.toLowerCase(),
      port,
      url.pathname.replace(/\/+$/, '').toLowerCase(),
      schema.toLowerCase(),
    ].join('|');
  } catch {
    return value.replace(/\s+/g, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function requireIntegrationDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL es obligatoria para la integración de Transporte.',
    );
  }

  // const normalUrl = process.env.DATABASE_URL?.trim();

  // if (
  //   normalUrl &&
  //   databaseIdentity(normalUrl) === databaseIdentity(testUrl)
  // ) {
  //   throw new Error(
  //     'TEST_DATABASE_URL no puede apuntar a la misma base que DATABASE_URL. ' +
  //       'Se rechazó la ejecución por seguridad.',
  //   );
  // }

  return testUrl;
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
