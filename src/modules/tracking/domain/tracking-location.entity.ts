export type TrackingLocationProps = Readonly<{
  sesionId: number;
  claveIdempotencia: string;
  latitud: number;
  longitud: number;
  precisionM: number | null;
  velocidadMps: number | null;
  bateriaPct: number | null;
  capturadoEn: Date;
}>;

export class TrackingLocationEntity {
  private constructor(private readonly props: TrackingLocationProps) {
    this.ensureValid();
  }

  static create(
    props: Omit<TrackingLocationProps, 'capturadoEn'> & {
      capturadoEn: string | Date;
    },
  ): TrackingLocationEntity {
    return new TrackingLocationEntity({
      ...props,
      capturadoEn: new Date(props.capturadoEn),
    });
  }

  toPrimitives(): TrackingLocationProps {
    return { ...this.props, capturadoEn: new Date(this.props.capturadoEn) };
  }

  private ensureValid(): void {
    if (!Number.isInteger(this.props.sesionId) || this.props.sesionId <= 0) {
      throw new Error('sesionTrackingId debe ser un entero positivo.');
    }
    if (!this.props.claveIdempotencia.trim()) {
      throw new Error('claveIdempotencia no puede estar vacía.');
    }
    if (!Number.isFinite(this.props.latitud) || this.props.latitud < -90 || this.props.latitud > 90) {
      throw new Error('latitud debe estar entre -90 y 90.');
    }
    if (!Number.isFinite(this.props.longitud) || this.props.longitud < -180 || this.props.longitud > 180) {
      throw new Error('longitud debe estar entre -180 y 180.');
    }
    if (this.props.precisionM != null && (!Number.isFinite(this.props.precisionM) || this.props.precisionM < 0)) {
      throw new Error('precision debe ser mayor o igual a 0.');
    }
    if (this.props.velocidadMps != null && (!Number.isFinite(this.props.velocidadMps) || this.props.velocidadMps < 0)) {
      throw new Error('velocidad debe ser mayor o igual a 0.');
    }
    if (this.props.bateriaPct != null && (!Number.isInteger(this.props.bateriaPct) || this.props.bateriaPct < 0 || this.props.bateriaPct > 100)) {
      throw new Error('bateria debe ser un entero entre 0 y 100.');
    }
    if (Number.isNaN(this.props.capturadoEn.getTime())) {
      throw new Error('capturadoEn debe contener una fecha válida.');
    }
  }
}
