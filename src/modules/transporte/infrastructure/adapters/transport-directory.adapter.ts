import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransportDirectoryPort } from '../../application/ports/transport-directory.port';

@Injectable()
export class TransportDirectoryAdapter implements TransportDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findStopById(id: number) {
    const row = await this.prisma.envioDespacho.findUnique({
      where: { id },
      include: {
        envio: {
          select: {
            id: true,
            numero: true,
            empresaId: true,
            estado: true,
            modalidad: true,
            responsableId: true,
            salidaEn: true,
            entregaEstimadaEn: true,
          },
        },
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
    if (!row) return null;
    return {
      empresaId: row.envio.empresaId,
      envioId: row.envio.id,
      envioNumero: row.envio.numero,
      envioEstado: row.envio.estado as any,
      modalidad: row.envio.modalidad as any,
      responsableId: row.envio.responsableId,
      salidaEn: row.envio.salidaEn,
      entregaEstimadaEn: row.envio.entregaEstimadaEn,
      envioDespachoId: row.id,
      paradaEstado: row.estado as any,
      ordenDespachoId: row.ordenDespachoId,
      clienteId: row.clienteId,
      secuencia: row.secuencia,
      destino: {
        destinatario: row.destinatario,
        telefono: row.telefonoDestino,
        direccion: row.direccionDestino,
        latitud: row.latitudDestino != null ? Number(row.latitudDestino) : null,
        longitud: row.longitudDestino != null ? Number(row.longitudDestino) : null,
      },
      carga: row.cargas.map((x) => ({
        envioCargaDetalleId: x.id,
        ordenDespachoDetalleId: x.ordenDespachoDetalleId,
        productoId: x.productoId,
        cantidadCargada: x.cantidadCargada,
      })),
    };
  }
}
