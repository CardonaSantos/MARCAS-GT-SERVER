import { Injectable } from '@nestjs/common';
import {
  EstadoEnvio,
  EstadoOrdenDespacho,
  EstadoRequisicion,
  EstadoTransferenciaBodega,
} from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { BodegaOperationalDependencies } from '../../domain/bodega.types';
import { BodegaOperationalDependenciesPort } from '../../domain/ports/bodega-operational-dependencies.port';

const REQUISICIONES_ABIERTAS: EstadoRequisicion[] = [
  'BORRADOR',
  'SOLICITADA',
  'APROBADA',
  'PARCIAL',
];

const TRANSFERENCIAS_ABIERTAS: EstadoTransferenciaBodega[] = [
  'BORRADOR',
  'PREPARADA',
  'EN_TRANSITO',
  'RECIBIDA_PARCIAL',
];

const DESPACHOS_ABIERTOS: EstadoOrdenDespacho[] = [
  'PENDIENTE',
  'PREPARANDO',
  'PREPARADA',
  'PARCIAL',
];

const ENVIOS_ABIERTOS: EstadoEnvio[] = [
  'PROGRAMADO',
  'ASIGNADO',
  'EN_RUTA',
  'ENTREGADO_PARCIAL',
  'INCIDENCIA',
];

@Injectable()
export class BodegaOperationalDependenciesPrismaAdapter
  implements BodegaOperationalDependenciesPort
{
  constructor(private readonly prisma: PrismaService) {}

  async inspect(bodegaId: number): Promise<BodegaOperationalDependencies> {
    const [stock, requisiciones, transferenciasOrigen, transferenciasDestino, despachos, envios] =
      await Promise.all([
        this.prisma.stockBodega.aggregate({
          where: { bodegaId },
          _sum: { cantidadReal: true, cantidadReservada: true },
        }),
        this.prisma.requisicion.count({
          where: { bodegaDestinoId: bodegaId, estado: { in: REQUISICIONES_ABIERTAS } },
        }),
        this.prisma.transferenciaBodega.count({
          where: { bodegaOrigenId: bodegaId, estado: { in: TRANSFERENCIAS_ABIERTAS } },
        }),
        this.prisma.transferenciaBodega.count({
          where: { bodegaDestinoId: bodegaId, estado: { in: TRANSFERENCIAS_ABIERTAS } },
        }),
        this.prisma.ordenDespacho.count({
          where: { bodegaId, estado: { in: DESPACHOS_ABIERTOS } },
        }),
        this.prisma.envioDespacho.findMany({
          where: {
            ordenDespacho: { bodegaId },
            envio: { estado: { in: ENVIOS_ABIERTOS } },
          },
          select: { envioId: true },
        }),
      ]);

    return {
      stockReal: stock._sum.cantidadReal ?? 0,
      stockReservado: stock._sum.cantidadReservada ?? 0,
      requisicionesPendientes: requisiciones,
      transferenciasPendientes: transferenciasOrigen + transferenciasDestino,
      despachosPendientes: despachos,
      enviosPendientes: new Set(envios.map((row) => row.envioId)).size,
    };
  }
}
