import {
  FiscalEnvironment,
  FiscalIdentityType,
  FiscalItemType,
} from '../../billing.types';

export type CompanyFiscalProfile = Readonly<{
  id: number;
  empresaId: number;
  nit: string;
  razonSocial: string;
  afiliacionIva: string;
  correoFiscal: string | null;
  direccion: string;
  codigoPostal: string | null;
  municipio: string;
  departamento: string;
  pais: string;
  preciosIncluyenImpuestos: boolean;
  tasaIvaDefault: string | null;
  activo: boolean;
}>;

export type FiscalEstablishment = Readonly<{
  id: number;
  empresaId: number;
  codigoSat: number;
  nombreComercial: string;
  correo: string | null;
  direccion: string;
  codigoPostal: string | null;
  municipio: string;
  departamento: string;
  pais: string;
  esPrincipal: boolean;
  activo: boolean;
}>;

export type CustomerFiscalProfile = Readonly<{
  clienteId: number;
  tipoIdentificacion: FiscalIdentityType;
  identificacion: string;
  nombreFiscal: string;
  correoFiscal: string | null;
  direccion: string | null;
  codigoPostal: string | null;
  municipio: string | null;
  departamento: string | null;
  pais: string;
}>;

export type ProductFiscalProfile = Readonly<{
  productoId: number;
  bienOServicio: FiscalItemType;
  unidadMedida: string;
  descripcionFiscal: string | null;
  nombreCortoImpuesto: string | null;
  codigoUnidadGravable: number | null;
  activo: boolean;
}>;

export type FelProviderConfig = Readonly<{
  id: number;
  empresaId: number;
  codigoProveedor: string;
  nombreProveedor: string;
  entorno: FiscalEnvironment;
  activo: boolean;
  prioridad: number;
  firmaConfigurada: boolean;
  appKeySecretRef: string | null;
  apiKeySecretRef: string | null;
  baseUrlOverride: string | null;
}>;

export interface FiscalConfigPort {
  getCompanyProfile(empresaId: number): Promise<CompanyFiscalProfile | null>;
  getEstablishment(empresaId: number, establecimientoId?: number): Promise<FiscalEstablishment | null>;
  getCustomerProfile(clienteId: number): Promise<CustomerFiscalProfile | null>;
  getProductProfiles(productIds: readonly number[]): Promise<readonly ProductFiscalProfile[]>;
  getProviderConfig(empresaId: number, entorno: FiscalEnvironment): Promise<FelProviderConfig | null>;

  upsertCompanyProfile(input: {
    empresaId: number;
    nit: string;
    razonSocial: string;
    afiliacionIva: string;
    correoFiscal?: string | null;
    direccion: string;
    codigoPostal?: string | null;
    municipio: string;
    departamento: string;
    pais?: string;
    preciosIncluyenImpuestos: boolean;
    tasaIvaDefault?: string | null;
  }): Promise<CompanyFiscalProfile>;

  upsertCustomerProfile(input: {
    clienteId: number;
    tipoIdentificacion: FiscalIdentityType;
    identificacion: string;
    nombreFiscal: string;
    correoFiscal?: string | null;
    direccion?: string | null;
    codigoPostal?: string | null;
    municipio?: string | null;
    departamento?: string | null;
    pais?: string;
  }): Promise<CustomerFiscalProfile>;

  upsertProductProfile(input: {
    productoId: number;
    bienOServicio: FiscalItemType;
    unidadMedida: string;
    descripcionFiscal?: string | null;
    nombreCortoImpuesto?: string | null;
    codigoUnidadGravable?: number | null;
    activo?: boolean;
  }): Promise<ProductFiscalProfile>;

  createEstablishment(input: {
    empresaId: number;
    codigoSat: number;
    nombreComercial: string;
    correo?: string | null;
    direccion: string;
    codigoPostal?: string | null;
    municipio: string;
    departamento: string;
    pais?: string;
    esPrincipal?: boolean;
  }): Promise<FiscalEstablishment>;
}
