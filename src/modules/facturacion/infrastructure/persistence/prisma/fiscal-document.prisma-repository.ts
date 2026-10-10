import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  EntornoFel,
  Prisma,
  TipoBienServicioFiscal,
  TipoIdentificacionFiscal,
} from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  BillingConcurrentModificationError,
  BillingInvalidStateError,
} from '../../../domain/errors/billing.errors';
import {
  FiscalDocumentRepositoryPort,
  PrepareFiscalDocumentInput,
  PreparedFiscalDocument,
} from '../../../domain/ports/fiscal-document.repository.port';

@Injectable()
export class FiscalDocumentPrismaRepository
  implements FiscalDocumentRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    input: PrepareFiscalDocumentInput,
  ): Promise<PreparedFiscalDocument> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.documentoFiscal.findUnique({
              where: { facturaId: input.facturaId },
            });
            if (existing) {
              return {
                id: existing.id,
                facturaId: existing.facturaId,
                serieInterna: existing.serieInterna,
                numeroInterno: existing.numeroInterno,
                estado: existing.estado,
              };
            }

            const invoice = await tx.factura.findUnique({
              where: { id: input.facturaId },
              select: {
                id: true,
                estado: true,
                version: true,
                total: true,
              },
            });
            if (!invoice) {
              throw new BillingConcurrentModificationError({
                facturaId: input.facturaId,
              });
            }
            if (invoice.estado !== 'BORRADOR') {
              throw new BillingInvalidStateError(
                invoice.estado,
                'preparar para emisión',
              );
            }
            if (invoice.version !== input.expectedInvoiceVersion) {
              throw new BillingConcurrentModificationError({
                facturaId: input.facturaId,
              });
            }

            const sequence = await tx.dteSecuencia.findUnique({
              where: {
                empresaId_establecimientoFiscalId_entorno_serieInterna: {
                  empresaId: input.empresaId,
                  establecimientoFiscalId: input.establecimientoFiscalId,
                  entorno: input.entorno as EntornoFel,
                  serieInterna: input.serieInterna,
                },
              },
            });

            let internalNumber: number;
            if (!sequence) {
              internalNumber = 1;
              await tx.dteSecuencia.create({
                data: {
                  empresaId: input.empresaId,
                  establecimientoFiscalId: input.establecimientoFiscalId,
                  entorno: input.entorno as EntornoFel,
                  serieInterna: input.serieInterna,
                  siguienteNumero: 2,
                },
              });
            } else {
              internalNumber = sequence.siguienteNumero;
              await tx.dteSecuencia.update({
                where: { id: sequence.id },
                data: {
                  siguienteNumero: { increment: 1 },
                  version: { increment: 1 },
                },
              });
            }

            for (const line of input.detalles) {
              await tx.facturaDetalle.update({
                where: { id: line.facturaDetalleId },
                data: {
                  descripcion: line.descripcion,
                  bienOServicio:
                    line.bienOServicio as TipoBienServicioFiscal,
                  unidadMedida: line.unidadMedida,
                  impuestoTotal: line.impuestoTotal,
                },
              });
              await tx.facturaDetalleImpuesto.deleteMany({
                where: { facturaDetalleId: line.facturaDetalleId },
              });
              if (line.impuestos.length) {
                await tx.facturaDetalleImpuesto.createMany({
                  data: line.impuestos.map((tax) => ({
                    facturaDetalleId: line.facturaDetalleId,
                    nombreCorto: tax.nombreCorto,
                    codigoUnidadGravable: tax.codigoUnidadGravable,
                    tasa: tax.tasa,
                    montoGravable: tax.montoGravable,
                    montoImpuesto: tax.montoImpuesto,
                  })),
                });
              }
            }

            const invoiceUpdate = await tx.factura.updateMany({
              where: {
                id: input.facturaId,
                estado: 'BORRADOR',
                version: input.expectedInvoiceVersion,
              },
              data: {
                estado: 'LISTA_EMISION',
                impuestoTotal: input.impuestoTotal,
                version: { increment: 1 },
              },
            });
            if (invoiceUpdate.count !== 1) {
              throw new BillingConcurrentModificationError({
                facturaId: input.facturaId,
              });
            }

            const payloadHash = createHash('sha256')
              .update(
                `${input.payloadHash}:${input.serieInterna}:${internalNumber}`,
              )
              .digest('hex');

            const document = await tx.documentoFiscal.create({
              data: {
                facturaId: input.facturaId,
                empresaId: input.empresaId,
                establecimientoFiscalId: input.establecimientoFiscalId,
                proveedorFelConfigId: input.proveedorFelConfigId,
                tipoDte: input.tipoDte,
                estado: 'PREPARADO',
                entorno: input.entorno as EntornoFel,
                codigoMoneda: input.codigoMoneda,
                fechaHoraEmision: input.fechaHoraEmision,
                granTotal: invoice.total,
                serieInterna: input.serieInterna,
                numeroInterno: internalNumber,
                emisorNit: input.emisor.nit,
                emisorNombre: input.emisor.nombre,
                emisorNombreComercial: input.emisor.nombreComercial,
                emisorAfiliacionIva: input.emisor.afiliacionIva,
                emisorCorreo: input.emisor.correo,
                emisorDireccion:
                  input.emisor.direccion as Prisma.InputJsonValue,
                receptorTipoIdentificacion:
                  input.receptor.tipoIdentificacion as TipoIdentificacionFiscal,
                receptorIdentificacion: input.receptor.identificacion,
                receptorNombre: input.receptor.nombre,
                receptorCorreo: input.receptor.correo,
                receptorDireccion: input.receptor.direccion
                  ? (input.receptor.direccion as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                payloadHash,
                versionEsquema: input.versionEsquema ?? null,
              },
            });

            await tx.facturaEvento.create({
              data: {
                facturaId: input.facturaId,
                usuarioId: input.actorId,
                tipo: 'PREPARADA',
                estado: 'LISTA_EMISION',
                detalle: 'Factura validada y preparada para emisión FEL.',
                claveIdempotencia: `BILLING:PREPARE:${input.facturaId}:${document.id}`,
                referenciaTipo: 'DOCUMENTO_FISCAL',
                referenciaId: document.id,
              },
            });

            await tx.documentoFiscalEvento.createMany({
              data: [
                {
                  documentoFiscalId: document.id,
                  usuarioId: input.actorId,
                  tipo: 'CREADO',
                  estado: 'BORRADOR',
                  detalle: 'Documento fiscal creado desde factura.',
                  claveIdempotencia: `FISCAL:CREATED:${document.id}`,
                },
                {
                  documentoFiscalId: document.id,
                  usuarioId: input.actorId,
                  tipo: 'PREPARADO',
                  estado: 'PREPARADO',
                  detalle:
                    'Snapshot fiscal validado y congelado para certificación.',
                  claveIdempotencia: `FISCAL:PREPARED:${document.id}`,
                },
              ],
            });

            return {
              id: document.id,
              facturaId: document.facturaId,
              serieInterna: document.serieInterna,
              numeroInterno: document.numeroInterno,
              estado: document.estado,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 2) continue;
        throw error;
      }
    }

    throw new BillingConcurrentModificationError({
      facturaId: input.facturaId,
    });
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
