import { FiscalEnvironment, FiscalIdentityType, FiscalItemType } from '../../billing.types';

export type PrepareFiscalDocumentInput = Readonly<{
  facturaId: number;
  actorId: number;
  expectedInvoiceVersion: number;
  empresaId: number;
  establecimientoFiscalId: number;
  proveedorFelConfigId: number | null;
  entorno: FiscalEnvironment;
  tipoDte: string;
  serieInterna: string;
  codigoMoneda: string;
  fechaHoraEmision: Date;
  emisor: {
    nit: string;
    nombre: string;
    nombreComercial: string;
    afiliacionIva: string;
    correo: string | null;
    direccion: Record<string, unknown>;
  };
  receptor: {
    tipoIdentificacion: FiscalIdentityType;
    identificacion: string;
    nombre: string;
    correo: string | null;
    direccion: Record<string, unknown> | null;
  };
  payloadHash: string;
  versionEsquema?: string | null;
  impuestoTotal: string;
  detalles: readonly {
    facturaDetalleId: number;
    descripcion: string;
    bienOServicio: FiscalItemType;
    unidadMedida: string;
    impuestoTotal: string;
    impuestos: readonly {
      nombreCorto: string;
      codigoUnidadGravable: number | null;
      tasa: string | null;
      montoGravable: string;
      montoImpuesto: string;
    }[];
  }[];
}>;

export type PreparedFiscalDocument = Readonly<{
  id: number;
  facturaId: number;
  serieInterna: string;
  numeroInterno: number;
  estado: string;
}>;

export interface FiscalDocumentRepositoryPort {
  prepare(input: PrepareFiscalDocumentInput): Promise<PreparedFiscalDocument>;
}
