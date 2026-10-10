import { PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { OrdenDespacho } from 'src/modules/despachos/domain/entities/dispatch-order.entity';
import {
  DispatchConcurrentModificationError,
  DispatchIdempotencyConflictError,
} from 'src/modules/despachos/domain/errors/dispatch.errors';
import { DispatchOperationPrismaRepository } from 'src/modules/despachos/infrastructure/persistence/prisma/dispatch-operation.prisma-repository';
import { DispatchPrismaRepository } from 'src/modules/despachos/infrastructure/persistence/prisma/dispatch.prisma-repository';
import {
  cleanupDispatchIntegrationFixture,
  createDispatchIntegrationFixture,
  DispatchIntegrationFixture,
} from './fixtures';
import { createIntegrationPrisma } from './integration-db';

describe('Despachos repositories / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: DispatchIntegrationFixture;
  let dispatches: DispatchPrismaRepository;
  let operations: DispatchOperationPrismaRepository;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();

    fixture = await createDispatchIntegrationFixture(prisma);

    const service = prisma as unknown as PrismaService;
    dispatches = new DispatchPrismaRepository(service);
    operations = new DispatchOperationPrismaRepository(service);
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupDispatchIntegrationFixture(prisma, fixture);
    }
    await prisma.$disconnect();
  });

  it('crea OrdenDespacho, genera número humano y persiste auditoría', async () => {
    const entity = OrdenDespacho.create({
      pedidoId: fixture.pedido.id,
      bodegaId: fixture.bodega.id,
      creadoPorId: fixture.admin.id,
      programadoEn: new Date('2026-10-02T14:00:00.000Z'),
      observaciones: 'Integración repositorio',
      detalles: [
        {
          pedidoDetalleId: fixture.pedidoDetalle.id,
          productoId: fixture.producto.id,
          cantidadProgramada: 10,
        },
      ],
    });

    const created = await dispatches.create(entity, {
      actorId: fixture.admin.id,
      tipo: 'CREADA',
      detalle: 'Creada desde integration test.',
      claveIdempotencia: `IT-DSP-CREATE-${fixture.suffix}`,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.numero).toBe(
      `DSP-${String(created.id).padStart(6, '0')}`,
    );
    expect(created.estado).toBe('PENDIENTE');
    expect(created.detalles).toHaveLength(1);

    const event = await prisma.ordenDespachoEvento.findUnique({
      where: {
        claveIdempotencia: `IT-DSP-CREATE-${fixture.suffix}`,
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        ordenDespachoId: created.id,
        usuarioId: fixture.admin.id,
        tipo: 'CREADA',
      }),
    );
  });

  it('detecta optimistic locking real en OrdenDespacho.version', async () => {
    const row = await prisma.ordenDespacho.findFirstOrThrow({
      where: { pedidoId: fixture.pedido.id },
      orderBy: { id: 'asc' },
    });

    const first = await dispatches.findById(row.id);
    const stale = await dispatches.findById(row.id);

    expect(first).not.toBeNull();
    expect(stale).not.toBeNull();

    const firstVersion = first!.version;
    const staleVersion = stale!.version;

    first!.replacePendingData({
      observaciones: 'Primera actualización',
    });
    stale!.replacePendingData({
      observaciones: 'Actualización obsoleta',
    });

    await dispatches.save(first!, firstVersion, [
      {
        actorId: fixture.admin.id,
        tipo: 'ACTUALIZADA',
        detalle: 'Primera actualización',
      },
    ]);

    await expect(
      dispatches.save(stale!, staleVersion, [
        {
          actorId: fixture.admin.id,
          tipo: 'ACTUALIZADA',
          detalle: 'No debería persistirse',
        },
      ]),
    ).rejects.toBeInstanceOf(
      DispatchConcurrentModificationError,
    );
  });

  it('hace idempotente un evento repetido con la misma clave', async () => {
    const row = await prisma.ordenDespacho.findFirstOrThrow({
      where: { pedidoId: fixture.pedido.id },
      orderBy: { id: 'asc' },
    });

    const key = `IT-DSP-EVENT-${fixture.suffix}`;

    await dispatches.appendEvent(row.id, {
      actorId: fixture.admin.id,
      tipo: 'OBSERVACION',
      detalle: 'Evento idempotente',
      claveIdempotencia: key,
    });

    await dispatches.appendEvent(row.id, {
      actorId: fixture.admin.id,
      tipo: 'OBSERVACION',
      detalle: 'Evento idempotente',
      claveIdempotencia: key,
    });

    expect(
      await prisma.ordenDespachoEvento.count({
        where: { claveIdempotencia: key },
      }),
    ).toBe(1);
  });

  it('persiste OperacionDespacho idempotente y rechaza misma clave con otro payload', async () => {
    const dispatch = await prisma.ordenDespacho.findFirstOrThrow({
      where: { pedidoId: fixture.pedido.id },
      include: { detalles: true },
      orderBy: { id: 'asc' },
    });

    const key = `IT-DSP-OP-${fixture.suffix}`;

    const first = await operations.prepare({
      ordenDespachoId: dispatch.id,
      usuarioId: fixture.admin.id,
      tipo: 'RESERVA_PREPARACION',
      claveIdempotencia: key,
      observaciones: 'Operación integración',
      detalles: [
        {
          ordenDespachoDetalleId: dispatch.detalles[0].id,
          cantidad: 10,
        },
      ],
    });

    const repeated = await operations.prepare({
      ordenDespachoId: dispatch.id,
      usuarioId: fixture.admin.id,
      tipo: 'RESERVA_PREPARACION',
      claveIdempotencia: key,
      observaciones: 'Operación integración',
      detalles: [
        {
          ordenDespachoDetalleId: dispatch.detalles[0].id,
          cantidad: 10,
        },
      ],
    });

    expect(repeated.id).toBe(first.id);
    expect(repeated.repeated).toBe(true);

    await expect(
      operations.prepare({
        ordenDespachoId: dispatch.id,
        usuarioId: fixture.admin.id,
        tipo: 'RESERVA_PREPARACION',
        claveIdempotencia: key,
        observaciones: 'Payload diferente',
        detalles: [
          {
            ordenDespachoDetalleId: dispatch.detalles[0].id,
            cantidad: 9,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(
      DispatchIdempotencyConflictError,
    );
  });

  it('commitDispatchLine actualiza línea + padre atómicamente y completa el despacho', async () => {
    const dispatch = await prisma.ordenDespacho.findFirstOrThrow({
      where: { pedidoId: fixture.pedido.id },
      include: { detalles: true },
      orderBy: { id: 'asc' },
    });

    await prisma.ordenDespacho.update({
      where: { id: dispatch.id },
      data: {
        estado: 'PREPARADA',
        preparadoPorId: fixture.admin.id,
        preparadoEn: new Date(),
        version: { increment: 1 },
      },
    });

    await prisma.ordenDespachoDetalle.update({
      where: { id: dispatch.detalles[0].id },
      data: {
        cantidadPreparada: 10,
        cantidadDespachada: 0,
        version: { increment: 1 },
      },
    });

    const first = await operations.prepare({
      ordenDespachoId: dispatch.id,
      usuarioId: fixture.admin.id,
      tipo: 'SALIDA_DESPACHO',
      claveIdempotencia: `IT-DSP-OUT-A-${fixture.suffix}`,
      detalles: [
        {
          ordenDespachoDetalleId: dispatch.detalles[0].id,
          cantidad: 4,
        },
      ],
    });

    await operations.recordInventoryResult(
      first.detalles[0].id,
      910001,
      920001,
    );

    await operations.commitDispatchLine(
      first.detalles[0].id,
      fixture.admin.id,
      new Date('2026-10-02T15:00:00.000Z'),
    );

    let persisted = await prisma.ordenDespacho.findUniqueOrThrow({
      where: { id: dispatch.id },
      include: { detalles: true },
    });

    expect(persisted.estado).toBe(
      'PARCIALMENTE_DESPACHADA',
    );
    expect(persisted.detalles[0].cantidadDespachada).toBe(4);

    const second = await operations.prepare({
      ordenDespachoId: dispatch.id,
      usuarioId: fixture.admin.id,
      tipo: 'SALIDA_DESPACHO',
      claveIdempotencia: `IT-DSP-OUT-B-${fixture.suffix}`,
      detalles: [
        {
          ordenDespachoDetalleId: dispatch.detalles[0].id,
          cantidad: 6,
        },
      ],
    });

    await operations.recordInventoryResult(
      second.detalles[0].id,
      910002,
      920002,
    );

    const completedAt = new Date(
      '2026-10-02T16:00:00.000Z',
    );

    await operations.commitDispatchLine(
      second.detalles[0].id,
      fixture.admin.id,
      completedAt,
    );

    persisted = await prisma.ordenDespacho.findUniqueOrThrow({
      where: { id: dispatch.id },
      include: { detalles: true },
    });

    expect(persisted.estado).toBe('DESPACHADA');
    expect(persisted.detalles[0].cantidadDespachada).toBe(10);
    expect(persisted.despachadoPorId).toBe(fixture.admin.id);
    expect(persisted.despachadoEn).toEqual(completedAt);

    const line = await prisma.operacionDespachoDetalle.findUniqueOrThrow({
      where: { id: second.detalles[0].id },
    });

    expect(line.estado).toBe('APLICADA');
    expect(line.movimientoInventarioId).toBe(920002);
  });
});
