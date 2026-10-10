import { Prisma } from '@prisma/client';

import { PrismaService } from 'src/prisma.service';
import { RequisitionPrismaQueryAdapter } from './requisition.prisma-query.adapter';

describe('RequisitionPrismaQueryAdapter.getSummary', () => {
  it('excluye requisiciones canceladas y rechazadas de unidades, costo y alertas operativas', async () => {
    const prisma = {
      requisicion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            estado: 'COMPLETADA',
            detalles: [
              {
                cantidadSolicitada: 10,
                cantidadRecibida: 10,
                costoUnitarioEstimado: new Prisma.Decimal('25.00'),
              },
              {
                cantidadSolicitada: 5,
                cantidadRecibida: 5,
                costoUnitarioEstimado: new Prisma.Decimal('25.00'),
              },
            ],
          },
          {
            id: 2,
            estado: 'CANCELADA',
            detalles: [
              {
                cantidadSolicitada: 10,
                cantidadRecibida: 0,
                costoUnitarioEstimado: new Prisma.Decimal('100.00'),
              },
            ],
          },
          {
            id: 3,
            estado: 'RECHAZADA',
            detalles: [
              {
                cantidadSolicitada: 4,
                cantidadRecibida: 0,
                costoUnitarioEstimado: new Prisma.Decimal('50.00'),
              },
            ],
          },
        ]),
      },
      recepcionRequisicion: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const adapter = new RequisitionPrismaQueryAdapter(prisma);

    const summary = await adapter.getSummary();

    expect(summary).toMatchObject({
      total: 3,
      completadas: 1,
      canceladas: 1,
      rechazadas: 1,
      abiertas: 0,
      unidadesSolicitadas: 15,
      unidadesRecibidas: 15,
      unidadesPendientes: 0,
      costoEstimadoTotal: '375.00',
      recepcionesPendientes: 0,
      recepcionesFallidas: 0,
    });

    expect(
      (prisma.recepcionRequisicion.groupBy as jest.Mock).mock.calls[0][0],
    ).toEqual(
      expect.objectContaining({
        where: {
          requisicionId: { in: [1] },
          estado: { in: ['PENDIENTE', 'FALLIDA'] },
        },
      }),
    );
  });
});
