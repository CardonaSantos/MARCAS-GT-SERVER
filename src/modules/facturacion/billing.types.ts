import { AppRole } from 'src/shared/security/roles.decorator';

export type InvoiceState =
  | 'BORRADOR'
  | 'LISTA_EMISION'
  | 'EMITIDA'
  | 'DESCARTADA'
  | 'ANULADA';

export type InvoiceEventType =
  | 'CREADA'
  | 'ACTUALIZADA'
  | 'PREPARADA'
  | 'EMISION_SOLICITADA'
  | 'EMITIDA'
  | 'DESCARTADA'
  | 'ANULACION_SOLICITADA'
  | 'ANULADA'
  | 'OBSERVACION';

export type FiscalDocumentState =
  | 'BORRADOR'
  | 'PREPARADO'
  | 'EN_PROCESO'
  | 'CERTIFICACION_INCIERTA'
  | 'CERTIFICADO'
  | 'RECHAZADO'
  | 'CONTINGENCIA'
  | 'ANULACION_PENDIENTE'
  | 'ANULADO';

export type FelOperationType =
  | 'GENERAR_XML'
  | 'FIRMAR'
  | 'CERTIFICAR'
  | 'CONSULTAR'
  | 'RECONCILIAR'
  | 'OBTENER_PDF'
  | 'ANULAR';

export type FelOperationState =
  | 'PENDIENTE'
  | 'EJECUTANDO'
  | 'REINTENTABLE'
  | 'INCIERTA'
  | 'EXITOSA'
  | 'RECHAZADA'
  | 'FALLIDA'
  | 'CANCELADA';

export type FiscalEnvironment = 'PRUEBAS' | 'PRODUCCION';
export type FiscalIdentityType = 'NIT' | 'CUI' | 'CF' | 'PASAPORTE' | 'OTRO';
export type FiscalItemType = 'BIEN' | 'SERVICIO';

export type BillingActor = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;
