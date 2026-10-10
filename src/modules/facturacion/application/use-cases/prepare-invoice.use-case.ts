import { Invoice } from '../../domain/entities/invoice.entity';
import {
  BillingNotFoundError,
  FiscalConfigurationError,
} from '../../domain/errors/billing.errors';
import { BillingMoney } from '../../domain/value-objects/billing-money.vo';
import { FiscalDocumentRepositoryPort } from '../../domain/ports/fiscal-document.repository.port';
import { InvoiceRepositoryPort } from '../../domain/ports/invoice.repository.port';
import { PrepareInvoiceCommand } from '../models/billing.models';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';
import { FiscalConfigPort } from '../ports/fiscal-config.port';
import {
  assertBillingOperator,
  requireBillingActor,
  stableHash,
} from './billing.helpers';
import { calculateIncludedTax } from './tax.helpers';

export class PrepareInvoiceUseCase {
  constructor(
    private readonly invoices: InvoiceRepositoryPort,
    private readonly fiscalDocuments: FiscalDocumentRepositoryPort,
    private readonly actors: BillingActorDirectoryPort,
    private readonly fiscal: FiscalConfigPort,
  ) {}

  async execute(command: PrepareInvoiceCommand) {
    const actor = await requireBillingActor(this.actors, command.actorId);
    assertBillingOperator(actor);

    const invoiceRow = await this.invoices.findById(command.id);
    if (!invoiceRow) throw new BillingNotFoundError(command.id);
    if (invoiceRow.empresaId !== actor.empresaId) {
      throw new FiscalConfigurationError(
        'FISCAL_SCOPE_MISMATCH',
        'La factura pertenece a otra empresa.',
      );
    }

    const invoice = Invoice.rehydrate(invoiceRow);
    invoice.assertEditable();

    const company = await this.fiscal.getCompanyProfile(invoiceRow.empresaId);
    if (!company || !company.activo) {
      throw new FiscalConfigurationError(
        'FISCAL_COMPANY_PROFILE_MISSING',
        'La empresa no tiene un perfil fiscal activo.',
      );
    }
    if (!company.preciosIncluyenImpuestos) {
      throw new FiscalConfigurationError(
        'FISCAL_PRICE_POLICY_NOT_SUPPORTED',
        'La V1 requiere precios comerciales con impuestos incluidos.',
      );
    }

    const establishment = await this.fiscal.getEstablishment(
      invoiceRow.empresaId,
      command.establecimientoId,
    );
    if (!establishment || !establishment.activo) {
      throw new FiscalConfigurationError(
        'FISCAL_ESTABLISHMENT_MISSING',
        'No existe un establecimiento fiscal activo para la factura.',
      );
    }

    const customer = await this.fiscal.getCustomerProfile(invoiceRow.clienteId);
    if (!customer) {
      throw new FiscalConfigurationError(
        'FISCAL_CUSTOMER_PROFILE_MISSING',
        'El cliente no tiene perfil fiscal configurado.',
        { clienteId: invoiceRow.clienteId },
      );
    }

    const productIds = [...new Set(invoiceRow.detalles.map((line) => line.productoId))];
    const profiles = await this.fiscal.getProductProfiles(productIds);
    const profileMap = new Map(profiles.map((profile) => [profile.productoId, profile]));
    const missing = productIds.filter((id) => !profileMap.get(id)?.activo);
    if (missing.length) {
      throw new FiscalConfigurationError(
        'FISCAL_PRODUCT_PROFILE_MISSING',
        'Uno o más productos no tienen perfil fiscal activo.',
        { productoIds: missing },
      );
    }

    const provider = await this.fiscal.getProviderConfig(
      invoiceRow.empresaId,
      command.entorno,
    );

    let totalTax = BillingMoney.zero();
    const fiscalLines = invoiceRow.detalles.map((line) => {
      const profile = profileMap.get(line.productoId)!;
      const taxes: {
        nombreCorto: string;
        codigoUnidadGravable: number | null;
        tasa: string | null;
        montoGravable: string;
        montoImpuesto: string;
      }[] = [];

      let taxRounded = BillingMoney.zero();
      if (profile.nombreCortoImpuesto) {
        if (!company.tasaIvaDefault) {
          throw new FiscalConfigurationError(
            'FISCAL_TAX_RATE_MISSING',
            'La empresa debe definir una tasa fiscal para productos gravados.',
            { productoId: line.productoId },
          );
        }
        const calculation = calculateIncludedTax(
          line.totalLinea,
          company.tasaIvaDefault,
        );
        taxRounded = BillingMoney.from(calculation.taxRounded);
        taxes.push({
          nombreCorto: profile.nombreCortoImpuesto,
          codigoUnidadGravable: profile.codigoUnidadGravable,
          tasa: company.tasaIvaDefault,
          montoGravable: calculation.base,
          montoImpuesto: calculation.tax,
        });
      }

      totalTax = totalTax.add(taxRounded);
      return {
        facturaDetalleId: line.id,
        descripcion: profile.descripcionFiscal?.trim() || line.descripcion,
        bienOServicio: profile.bienOServicio,
        unidadMedida: profile.unidadMedida,
        impuestoTotal: taxRounded.toString(),
        impuestos: taxes,
      };
    });

    const serieInterna = (command.serieInterna ?? 'FEL').trim().toUpperCase();
    if (!serieInterna || serieInterna.length > 40) {
      throw new FiscalConfigurationError(
        'FISCAL_INTERNAL_SERIES_INVALID',
        'La serie interna FEL es inválida.',
      );
    }

    const snapshot = {
      facturaId: invoiceRow.id,
      tipoDte: command.tipoDte.trim().toUpperCase(),
      entorno: command.entorno,
      moneda: invoiceRow.moneda,
      total: invoiceRow.total,
      empresa: company,
      establecimiento: establishment,
      receptor: customer,
      detalles: invoiceRow.detalles.map((line) => ({
        ...line,
        fiscal: fiscalLines.find((item) => item.facturaDetalleId === line.id),
      })),
    };

    invoice.markPrepared();

    return this.fiscalDocuments.prepare({
      facturaId: invoiceRow.id,
      actorId: actor.id,
      expectedInvoiceVersion: invoiceRow.version,
      empresaId: invoiceRow.empresaId,
      establecimientoFiscalId: establishment.id,
      proveedorFelConfigId: provider?.id ?? null,
      entorno: command.entorno,
      tipoDte: command.tipoDte.trim().toUpperCase(),
      serieInterna,
      codigoMoneda: invoiceRow.moneda,
      fechaHoraEmision: new Date(),
      emisor: {
        nit: company.nit,
        nombre: company.razonSocial,
        nombreComercial: establishment.nombreComercial,
        afiliacionIva: company.afiliacionIva,
        correo: establishment.correo ?? company.correoFiscal,
        direccion: {
          direccion: establishment.direccion,
          codigoPostal: establishment.codigoPostal,
          municipio: establishment.municipio,
          departamento: establishment.departamento,
          pais: establishment.pais,
        },
      },
      receptor: {
        tipoIdentificacion: customer.tipoIdentificacion,
        identificacion: customer.identificacion,
        nombre: customer.nombreFiscal,
        correo: customer.correoFiscal,
        direccion: customer.direccion
          ? {
              direccion: customer.direccion,
              codigoPostal: customer.codigoPostal,
              municipio: customer.municipio,
              departamento: customer.departamento,
              pais: customer.pais,
            }
          : null,
      },
      payloadHash: stableHash(snapshot),
      versionEsquema: command.versionEsquema ?? null,
      impuestoTotal: totalTax.toString(),
      detalles: fiscalLines,
    });
  }
}
