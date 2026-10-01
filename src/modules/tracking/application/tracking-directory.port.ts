export type TrackingSnapshot = Readonly<{
  usuarioId: number;
  sesionId: number | null;
  sesionActiva: boolean;
  ultimoHeartbeatEn: Date | null;
  latitud: number | null;
  longitud: number | null;
  precisionM: number | null;
  velocidadMps: number | null;
  bateriaPct: number | null;
  capturadoEn: Date | null;
}>;
export interface TrackingDirectoryPort {
  getCurrent(userId: number): Promise<TrackingSnapshot>;
  listHistory(
    userId: number,
    filters: { desde?: Date; hasta?: Date; page: number; limit: number },
  ): Promise<any>;
}
