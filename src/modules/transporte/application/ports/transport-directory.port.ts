import { ShipmentMode, ShipmentState, StopState } from '../../transport.types';

export type TransportDeliveryEntry = Readonly<{
  empresaId: number;
  envioId: number;
  envioNumero: string;
  envioEstado: ShipmentState;
  modalidad: ShipmentMode;
  responsableId: number | null;
  salidaEn: Date | null;
  entregaEstimadaEn: Date | null;

  envioDespachoId: number;
  paradaEstado: StopState;
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
