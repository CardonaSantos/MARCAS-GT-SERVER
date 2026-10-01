import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransportCatalogRepositoryPort } from '../../../domain/ports/transport-catalog.repository.port';
import { DriverState, VehicleState } from '../../../transport.types';
@Injectable()
export class TransportCatalogPrismaRepository
  implements TransportCatalogRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}
  async findVehicle(id: number) {
    const r = await this.prisma.vehiculo.findUnique({
      where: { id },
      select: {
        id: true,
        empresaId: true,
        estado: true,
        activo: true,
        version: true,
      },
    });
    return r ? { ...r, estado: r.estado as VehicleState } : null;
  }
  async findDriver(id: number) {
    const r = await this.prisma.conductor.findUnique({
      where: { id },
      select: {
        id: true,
        empresaId: true,
        estado: true,
        activo: true,
        version: true,
      },
    });
    return r ? { ...r, estado: r.estado as DriverState } : null;
  }
  async findCarrier(id: number) {
    const r = await this.prisma.transportista.findUnique({
      where: { id },
      select: {
        id: true,
        empresaId: true,
        tipo: true,
        activo: true,
        version: true,
      },
    });
    return r ? { ...r, tipo: r.tipo as 'INTERNO' | 'EXTERNO' } : null;
  }
  createCarrier(input: any) {
    return this.prisma.transportista.create({
      data: input,
      select: { id: true },
    });
  }
  createVehicle(input: any) {
    return this.prisma.vehiculo.create({ data: input, select: { id: true } });
  }
  createDriver(input: any) {
    return this.prisma.conductor.create({ data: input, select: { id: true } });
  }
  async deactivateCarrier(id: number, reason: string) {
    await this.prisma.transportista.update({
      where: { id },
      data: {
        activo: false,
        motivoInactivacion: reason.trim(),
        inactivadaEn: new Date(),
        version: { increment: 1 },
      },
    });
  }
  async deactivateVehicle(id: number, reason: string) {
    await this.prisma.vehiculo.update({
      where: { id },
      data: {
        activo: false,
        estado: 'INACTIVO',
        motivoInactivacion: reason.trim(),
        inactivadaEn: new Date(),
        version: { increment: 1 },
      },
    });
  }
  async deactivateDriver(id: number, reason: string) {
    await this.prisma.conductor.update({
      where: { id },
      data: {
        activo: false,
        estado: 'INACTIVO',
        motivoInactivacion: reason.trim(),
        inactivadaEn: new Date(),
        version: { increment: 1 },
      },
    });
  }
}
