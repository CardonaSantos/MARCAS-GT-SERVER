export type TrackingSessionStatus = 'ACTIVA' | 'FINALIZADA' | 'EXPIRADA';

export type TrackingSessionProps = Readonly<{
  id?: number;
  usuarioId: number;
  asistenciaId: number | null;
  estado: TrackingSessionStatus;
  iniciadaEn: Date;
  finalizadaEn: Date | null;
  ultimoHeartbeatEn: Date;
  motivoCierre?: string | null;
}>;

export class TrackingSessionEntity {
  private constructor(private props: TrackingSessionProps) {
    this.ensureValid();
  }

  static start(params: {
    usuarioId: number;
    asistenciaId: number;
    iniciadaEn?: Date;
  }): TrackingSessionEntity {
    const iniciadaEn = params.iniciadaEn
      ? new Date(params.iniciadaEn)
      : new Date();

    return new TrackingSessionEntity({
      usuarioId: params.usuarioId,
      asistenciaId: params.asistenciaId,
      estado: 'ACTIVA',
      iniciadaEn,
      finalizadaEn: null,
      ultimoHeartbeatEn: new Date(iniciadaEn),
      motivoCierre: null,
    });
  }

  static hydrate(props: TrackingSessionProps): TrackingSessionEntity {
    return new TrackingSessionEntity({
      ...props,
      iniciadaEn: new Date(props.iniciadaEn),
      finalizadaEn: props.finalizadaEn
        ? new Date(props.finalizadaEn)
        : null,
      ultimoHeartbeatEn: new Date(props.ultimoHeartbeatEn),
    });
  }

  get id() { return this.props.id; }
  get usuarioId() { return this.props.usuarioId; }
  get asistenciaId() { return this.props.asistenciaId; }
  get estado() { return this.props.estado; }
  get iniciadaEn() { return new Date(this.props.iniciadaEn); }
  get finalizadaEn() {
    return this.props.finalizadaEn ? new Date(this.props.finalizadaEn) : null;
  }
  get ultimoHeartbeatEn() { return new Date(this.props.ultimoHeartbeatEn); }
  get isActiva() { return this.props.estado === 'ACTIVA'; }
  get isFinalizada() { return this.props.estado === 'FINALIZADA'; }
  get isExpirada() { return this.props.estado === 'EXPIRADA'; }

  registrarHeartbeat(ocurridoEn: Date): void {
    if (!this.isActiva) {
      throw new Error('Solo una sesión ACTIVA puede registrar heartbeat.');
    }
    const heartbeat = new Date(ocurridoEn);
    if (Number.isNaN(heartbeat.getTime())) {
      throw new Error('El heartbeat no contiene una fecha válida.');
    }
    if (heartbeat.getTime() < this.props.iniciadaEn.getTime()) {
      throw new Error('El heartbeat no puede ser anterior al inicio de la sesión.');
    }
    if (heartbeat.getTime() <= this.props.ultimoHeartbeatEn.getTime()) return;
    this.props = { ...this.props, ultimoHeartbeatEn: heartbeat };
  }

  finalizar(finalizadoEn: Date): void {
    if (this.isFinalizada) return;
    if (this.isExpirada) {
      throw new Error('Una sesión EXPIRADA no puede finalizarse manualmente.');
    }
    const end = new Date(finalizadoEn);
    if (Number.isNaN(end.getTime())) {
      throw new Error('La fecha de finalización no es válida.');
    }
    if (end.getTime() < this.props.ultimoHeartbeatEn.getTime()) {
      throw new Error('La finalización no puede ser anterior al último heartbeat.');
    }
    this.props = {
      ...this.props,
      estado: 'FINALIZADA',
      finalizadaEn: end,
      motivoCierre: 'MANUAL',
    };
    this.ensureValid();
  }

  expirar(): void {
    if (!this.isActiva) return;
    this.props = {
      ...this.props,
      estado: 'EXPIRADA',
      finalizadaEn: new Date(this.props.ultimoHeartbeatEn),
      motivoCierre: 'HEARTBEAT_EXPIRADO',
    };
    this.ensureValid();
  }

  toPrimitives(): TrackingSessionProps {
    return {
      ...this.props,
      iniciadaEn: new Date(this.props.iniciadaEn),
      finalizadaEn: this.props.finalizadaEn ? new Date(this.props.finalizadaEn) : null,
      ultimoHeartbeatEn: new Date(this.props.ultimoHeartbeatEn),
    };
  }

  private ensureValid(): void {
    if (!Number.isInteger(this.props.usuarioId) || this.props.usuarioId <= 0) {
      throw new Error('usuarioId debe ser un identificador válido.');
    }
    if (
      this.props.asistenciaId != null &&
      (!Number.isInteger(this.props.asistenciaId) || this.props.asistenciaId <= 0)
    ) {
      throw new Error('asistenciaId debe ser un identificador válido.');
    }
    if (this.props.ultimoHeartbeatEn.getTime() < this.props.iniciadaEn.getTime()) {
      throw new Error('El último heartbeat no puede ser anterior al inicio.');
    }
    if (this.props.estado === 'ACTIVA' && this.props.finalizadaEn !== null) {
      throw new Error('Una sesión ACTIVA no puede tener fecha de finalización.');
    }
    if (this.props.estado !== 'ACTIVA' && this.props.finalizadaEn === null) {
      throw new Error('Una sesión cerrada debe tener fecha de finalización.');
    }
    if (
      this.props.estado === 'EXPIRADA' &&
      this.props.finalizadaEn?.getTime() !== this.props.ultimoHeartbeatEn.getTime()
    ) {
      throw new Error('Una sesión EXPIRADA debe finalizar en su último heartbeat.');
    }
  }
}
