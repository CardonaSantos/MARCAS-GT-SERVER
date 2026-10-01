import { ShipmentState } from '../../transport.types';
export type TransportDeliveryEntry = Readonly<{
  envioId: number;
  envioNumero: string;
  envioEstado: ShipmentState;
  envioDespachoId: number;
  ordenDespachoId: number;
  clienteId: number;
  secuencia: number;
  destino: {
    destinatario: string;
    telefono: string | null;
    direccion: string;
    latitud: number | null;
    longitud: number | null;
  };
  carga: ReadonlyArray<{
    envioCargaDetalleId: number;
    ordenDespachoDetalleId: number;
    productoId: number;
    cantidadCargada: number;
  }>;
}>;
export interface TransportDirectoryPort {
  findStopById(envioDespachoId: number): Promise<TransportDeliveryEntry | null>;
}
