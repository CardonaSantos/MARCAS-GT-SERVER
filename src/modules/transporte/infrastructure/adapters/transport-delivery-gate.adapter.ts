import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransportDeliveryGatePort } from '../../application/ports/transport-delivery-gate.port';
@Injectable()
export class TransportDeliveryGateAdapter implements TransportDeliveryGatePort {
  constructor(private readonly prisma: PrismaService) {}
  async markStopResult(input: any) {
    const old = await this.prisma.envioEvento.findUnique({
      where: { claveIdempotencia: input.claveIdempotencia },
      select: { id: true },
    });
    if (old) return;
    await this.prisma.$transaction(async (tx) => {
      const stop = await tx.envioDespacho.findUnique({
        where: { id: input.envioDespachoId },
        include: { envio: true },
      });
      if (!stop) throw new Error('Parada de envío no encontrada.');
      // Entregas comunica un resultado terminal del intento de atención.
      // Incluso RECHAZADA/NO_ENTREGADA significa que la parada ya fue visitada;
      // no debe convertirse en una incidencia técnica huérfana de Transporte.
      await tx.envioDespacho.update({
        where: { id: stop.id },
        data: {
          estado: 'ATENDIDA',
          version: { increment: 1 },
        },
      });
      const siblings = await tx.envioDespacho.findMany({
        where: { envioId: stop.envioId, id: { not: stop.id } },
        select: { estado: true },
      });
      const all = siblings.every((x) => x.estado === 'ATENDIDA');
      const next = all ? 'COMPLETADO' : 'ENTREGADO_PARCIAL';
      await tx.envio.update({
        where: { id: stop.envioId },
        data: {
          estado: next,
          ...(all
            ? { completadoEn: new Date(), completadoPorId: input.actorId }
            : {}),
          version: { increment: 1 },
        },
      });
      if (all && stop.envio.modalidad === 'INTERNO') {
        if (stop.envio.vehiculoId)
          await tx.vehiculo.updateMany({
            where: { id: stop.envio.vehiculoId, estado: 'EN_RUTA' },
            data: { estado: 'DISPONIBLE', version: { increment: 1 } },
          });
        if (stop.envio.conductorId)
          await tx.conductor.updateMany({
            where: { id: stop.envio.conductorId, estado: 'EN_RUTA' },
            data: { estado: 'DISPONIBLE', version: { increment: 1 } },
          });
      }
      await tx.envioEvento.create({
        data: {
          envioId: stop.envioId,
          usuarioId: input.actorId,
          tipo: all ? 'COMPLETADO' : 'PARADA_ATENDIDA',
          estado: next,
          descripcion:
            input.detalle ?? `Resultado de parada: ${input.resultado}`,
          claveIdempotencia: input.claveIdempotencia,
          metadata: { envioDespachoId: stop.id, resultado: input.resultado },
        },
      });
    });
  }
}
