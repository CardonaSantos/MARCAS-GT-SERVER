import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CustomerFiscalProfile,
  FelProviderConfig,
  FiscalConfigPort,
  FiscalEstablishment,
  ProductFiscalProfile,
} from '../../application/ports/fiscal-config.port';
import {
  FiscalEnvironment,
  FiscalIdentityType,
  FiscalItemType,
} from '../../billing.types';
import { BillingValidationError } from '../../domain/errors/billing.errors';

@Injectable()
export class FiscalConfigPrismaAdapter implements FiscalConfigPort {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyProfile(empresaId: number) {
    const row = await this.prisma.empresaPerfilFiscal.findUnique({ where: { empresaId } });
    if (!row) return null;
    return {
      ...row,
      tasaIvaDefault: row.tasaIvaDefault?.toFixed(4) ?? null,
    };
  }

  async getEstablishment(empresaId: number, establecimientoId?: number) {
    const row = establecimientoId
      ? await this.prisma.establecimientoFiscal.findFirst({
          where: { id: establecimientoId, empresaId },
        })
      : await this.prisma.establecimientoFiscal.findFirst({
          where: { empresaId, activo: true },
          orderBy: [{ esPrincipal: 'desc' }, { id: 'asc' }],
        });
    return row as FiscalEstablishment | null;
  }

  async getCustomerProfile(clienteId: number): Promise<CustomerFiscalProfile | null> {
    const row = await this.prisma.clientePerfilFiscal.findUnique({ where: { clienteId } });
    if (!row) return null;
    return {
      ...row,
      tipoIdentificacion: row.tipoIdentificacion as FiscalIdentityType,
    };
  }

  async getProductProfiles(productIds: readonly number[]): Promise<readonly ProductFiscalProfile[]> {
    if (!productIds.length) return [];
    const rows = await this.prisma.productoPerfilFiscal.findMany({
      where: { productoId: { in: [...productIds] } },
    });
    return rows.map((row) => ({
      ...row,
      bienOServicio: row.bienOServicio as FiscalItemType,
    }));
  }

  async getProviderConfig(
    empresaId: number,
    entorno: FiscalEnvironment,
  ): Promise<FelProviderConfig | null> {
    const row = await this.prisma.empresaProveedorFel.findFirst({
      where: { empresaId, entorno, activo: true, proveedorFel: { activo: true } },
      orderBy: [{ prioridad: 'asc' }, { id: 'asc' }],
      include: { proveedorFel: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      empresaId: row.empresaId,
      codigoProveedor: row.proveedorFel.codigo,
      nombreProveedor: row.proveedorFel.nombre,
      entorno: row.entorno as FiscalEnvironment,
      activo: row.activo,
      prioridad: row.prioridad,
      firmaConfigurada: row.firmaConfigurada,
      appKeySecretRef: row.appKeySecretRef,
      apiKeySecretRef: row.apiKeySecretRef,
      baseUrlOverride: row.baseUrlOverride,
    };
  }

  async upsertCompanyProfile(input: Parameters<FiscalConfigPort['upsertCompanyProfile']>[0]) {
    const row = await this.prisma.empresaPerfilFiscal.upsert({
      where: { empresaId: input.empresaId },
      create: {
        empresaId: input.empresaId,
        nit: input.nit.trim(),
        razonSocial: input.razonSocial.trim(),
        afiliacionIva: input.afiliacionIva.trim().toUpperCase(),
        correoFiscal: input.correoFiscal?.trim() || null,
        direccion: input.direccion.trim(),
        codigoPostal: input.codigoPostal?.trim() || null,
        municipio: input.municipio.trim(),
        departamento: input.departamento.trim(),
        pais: (input.pais ?? 'GT').trim().toUpperCase(),
        preciosIncluyenImpuestos: input.preciosIncluyenImpuestos,
        tasaIvaDefault: input.tasaIvaDefault ?? null,
      },
      update: {
        nit: input.nit.trim(),
        razonSocial: input.razonSocial.trim(),
        afiliacionIva: input.afiliacionIva.trim().toUpperCase(),
        correoFiscal: input.correoFiscal?.trim() || null,
        direccion: input.direccion.trim(),
        codigoPostal: input.codigoPostal?.trim() || null,
        municipio: input.municipio.trim(),
        departamento: input.departamento.trim(),
        pais: (input.pais ?? 'GT').trim().toUpperCase(),
        preciosIncluyenImpuestos: input.preciosIncluyenImpuestos,
        tasaIvaDefault: input.tasaIvaDefault ?? null,
        version: { increment: 1 },
      },
    });
    return { ...row, tasaIvaDefault: row.tasaIvaDefault?.toFixed(4) ?? null };
  }

  async upsertCustomerProfile(input: Parameters<FiscalConfigPort['upsertCustomerProfile']>[0]) {
    const row = await this.prisma.clientePerfilFiscal.upsert({
      where: { clienteId: input.clienteId },
      create: {
        clienteId: input.clienteId,
        tipoIdentificacion: input.tipoIdentificacion,
        identificacion: input.identificacion.trim().toUpperCase(),
        nombreFiscal: input.nombreFiscal.trim(),
        correoFiscal: input.correoFiscal?.trim() || null,
        direccion: input.direccion?.trim() || null,
        codigoPostal: input.codigoPostal?.trim() || null,
        municipio: input.municipio?.trim() || null,
        departamento: input.departamento?.trim() || null,
        pais: (input.pais ?? 'GT').trim().toUpperCase(),
      },
      update: {
        tipoIdentificacion: input.tipoIdentificacion,
        identificacion: input.identificacion.trim().toUpperCase(),
        nombreFiscal: input.nombreFiscal.trim(),
        correoFiscal: input.correoFiscal?.trim() || null,
        direccion: input.direccion?.trim() || null,
        codigoPostal: input.codigoPostal?.trim() || null,
        municipio: input.municipio?.trim() || null,
        departamento: input.departamento?.trim() || null,
        pais: (input.pais ?? 'GT').trim().toUpperCase(),
        version: { increment: 1 },
      },
    });
    return {
      ...row,
      tipoIdentificacion: row.tipoIdentificacion as FiscalIdentityType,
    };
  }

  async upsertProductProfile(input: Parameters<FiscalConfigPort['upsertProductProfile']>[0]) {
    const row = await this.prisma.productoPerfilFiscal.upsert({
      where: { productoId: input.productoId },
      create: {
        productoId: input.productoId,
        bienOServicio: input.bienOServicio,
        unidadMedida: input.unidadMedida.trim().toUpperCase(),
        descripcionFiscal: input.descripcionFiscal?.trim() || null,
        nombreCortoImpuesto: input.nombreCortoImpuesto?.trim().toUpperCase() || null,
        codigoUnidadGravable: input.codigoUnidadGravable ?? null,
        activo: input.activo ?? true,
      },
      update: {
        bienOServicio: input.bienOServicio,
        unidadMedida: input.unidadMedida.trim().toUpperCase(),
        descripcionFiscal: input.descripcionFiscal?.trim() || null,
        nombreCortoImpuesto: input.nombreCortoImpuesto?.trim().toUpperCase() || null,
        codigoUnidadGravable: input.codigoUnidadGravable ?? null,
        activo: input.activo ?? true,
        version: { increment: 1 },
      },
    });
    return { ...row, bienOServicio: row.bienOServicio as FiscalItemType };
  }

  async createEstablishment(input: Parameters<FiscalConfigPort['createEstablishment']>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.esPrincipal) {
          await tx.establecimientoFiscal.updateMany({
            where: { empresaId: input.empresaId, esPrincipal: true },
            data: { esPrincipal: false, version: { increment: 1 } },
          });
        }
        return tx.establecimientoFiscal.create({
          data: {
            empresaId: input.empresaId,
            codigoSat: input.codigoSat,
            nombreComercial: input.nombreComercial.trim(),
            correo: input.correo?.trim() || null,
            direccion: input.direccion.trim(),
            codigoPostal: input.codigoPostal?.trim() || null,
            municipio: input.municipio.trim(),
            departamento: input.departamento.trim(),
            pais: (input.pais ?? 'GT').trim().toUpperCase(),
            esPrincipal: input.esPrincipal ?? false,
          },
        });
      });
    } catch (error) {
      throw new BillingValidationError('No se pudo crear el establecimiento fiscal.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
