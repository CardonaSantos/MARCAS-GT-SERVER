import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransportDirectoryPort } from '../../application/ports/transport-directory.port';
@Injectable()
export class TransportDirectoryAdapter implements TransportDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findStopById(id: number) {
    const r = await this.prisma.envioDespacho.findUnique({
      where: { id },
      include: {
        envio: { select: { id: true, numero: true, estado: true } },
        cargas: {
          select: {
            id: true,
            ordenDespachoDetalleId: true,
            productoId: true,
            cantidadCargada: true,
          },
        },
      },
    });
    if (!r) return null;
    return {
      envioId: r.envio.id,
      envioNumero: r.envio.numero,
      envioEstado: r.envio.estado as any,
      envioDespachoId: r.id,
      ordenDespachoId: r.ordenDespachoId,
      clienteId: r.clienteId,
      secuencia: r.secuencia,
      destino: {
        destinatario: r.destinatario,
        telefono: r.telefonoDestino,
        direccion: r.direccionDestino,
        latitud: r.latitudDestino != null ? Number(r.latitudDestino) : null,
        longitud: r.longitudDestino != null ? Number(r.longitudDestino) : null,
      },
      carga: r.cargas.map((x) => ({
        envioCargaDetalleId: x.id,
        ordenDespachoDetalleId: x.ordenDespachoDetalleId,
        productoId: x.productoId,
        cantidadCargada: x.cantidadCargada,
      })),
    };
  }
}
