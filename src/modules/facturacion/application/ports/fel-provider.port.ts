import { FelProviderConfig } from './fiscal-config.port';

export type FelProviderDocument = Readonly<{
  documentoFiscalId: number;
  nitEmisor: string;
  establecimientoCodigo: number;
  serieInterna: string;
  numeroInterno: number;
  tipoDte: string;
  payloadHash: string;
  xml?: string | null;
}>;

export type FelProviderResult = Readonly<{
  status: 'OK' | 'REJECTED' | 'UNCERTAIN' | 'RETRYABLE';
  refId?: string | null;
  uuid?: string | null;
  serie?: string | null;
  numero?: string | null;
  fechaCertificacion?: Date | null;
  xmlCertificado?: string | null;
  code?: string | null;
  message?: string | null;
}>;

export interface FelProviderPort {
  readonly code: string;
  isConfigured(config: FelProviderConfig): Promise<boolean>;
  certify(config: FelProviderConfig, document: FelProviderDocument): Promise<FelProviderResult>;
  reconcile(config: FelProviderConfig, document: FelProviderDocument): Promise<FelProviderResult>;
}

export interface FelProviderRegistryPort {
  resolve(code: string): FelProviderPort | null;
}
