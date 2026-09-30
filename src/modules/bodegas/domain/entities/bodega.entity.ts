import {
  BodegaAlreadyActiveError,
  BodegaAlreadyInactiveError,
  BodegaAlreadyPrincipalError,
  BodegaInactiveCannotBePrincipalError,
  BodegaPrincipalCannotBeDeactivatedError,
  InvalidBodegaDeactivationReasonError,
  InvalidBodegaNameError,
} from '../errors/bodega.errors';
import { BodegaCode } from '../value-objects/bodega-code.vo';

export type BodegaProps = Readonly<{
  id?: number;
  empresaId: number;
  codigo: BodegaCode;
  nombre: string;
  descripcion?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  esPrincipal: boolean;
  responsableId?: number | null;
  activo: boolean;
  motivoInactivacion?: string | null;
  inactivadaEn?: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type BodegaCreateProps = Readonly<{
  empresaId: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  esPrincipal?: boolean;
  responsableId?: number | null;
}>;

export type BodegaUpdateData = Readonly<{
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  direccion?: string | null;
  telefono?: string | null;
}>;

export class Bodega {
  private constructor(private props: BodegaProps) {}

  static create(input: BodegaCreateProps, now = new Date()): Bodega {
    return new Bodega({
      empresaId: input.empresaId,
      codigo: BodegaCode.create(input.codigo),
      nombre: Bodega.normalizeRequiredName(input.nombre),
      descripcion: Bodega.normalizeNullable(input.descripcion),
      direccion: Bodega.normalizeNullable(input.direccion),
      telefono: Bodega.normalizeNullable(input.telefono),
      esPrincipal: input.esPrincipal ?? false,
      responsableId: input.responsableId ?? null,
      activo: true,
      motivoInactivacion: null,
      inactivadaEn: null,
      creadoEn: now,
      actualizadoEn: now,
    });
  }

  static rehydrate(props: BodegaProps): Bodega {
    return new Bodega(props);
  }

  updateDetails(data: BodegaUpdateData, now = new Date()): void {
    let changed = false;

    if (data.codigo !== undefined) {
      const next = BodegaCode.create(data.codigo);
      if (!next.equals(this.props.codigo)) {
        this.props = { ...this.props, codigo: next };
        changed = true;
      }
    }

    if (data.nombre !== undefined) {
      const next = Bodega.normalizeRequiredName(data.nombre);
      if (next !== this.props.nombre) {
        this.props = { ...this.props, nombre: next };
        changed = true;
      }
    }

    for (const key of ['descripcion', 'direccion', 'telefono'] as const) {
      if (data[key] !== undefined) {
        const next = Bodega.normalizeNullable(data[key]);
        if (next !== this.props[key]) {
          this.props = { ...this.props, [key]: next };
          changed = true;
        }
      }
    }

    if (changed) {
      this.props = { ...this.props, actualizadoEn: now };
    }
  }

  assignResponsible(userId: number, now = new Date()): void {
    if (this.props.responsableId !== userId) {
      this.props = {
        ...this.props,
        responsableId: userId,
        actualizadoEn: now,
      };
    }
  }

  removeResponsible(now = new Date()): void {
    if (this.props.responsableId !== null) {
      this.props = {
        ...this.props,
        responsableId: null,
        actualizadoEn: now,
      };
    }
  }

  activate(now = new Date()): void {
    if (this.props.activo) {
      throw new BodegaAlreadyActiveError(this.props.id);
    }

    this.props = {
      ...this.props,
      activo: true,
      motivoInactivacion: null,
      inactivadaEn: null,
      actualizadoEn: now,
    };
  }

  assertCanDeactivate(reason: string): void {
    if (!this.props.activo) {
      throw new BodegaAlreadyInactiveError(this.props.id);
    }

    if (this.props.esPrincipal) {
      throw new BodegaPrincipalCannotBeDeactivatedError(this.props.id);
    }

    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 3) {
      throw new InvalidBodegaDeactivationReasonError();
    }
  }

  deactivate(reason: string, now = new Date()): void {
    this.assertCanDeactivate(reason);
    const normalizedReason = String(reason).trim();

    this.props = {
      ...this.props,
      activo: false,
      motivoInactivacion: normalizedReason,
      inactivadaEn: now,
      actualizadoEn: now,
    };
  }

  markAsPrincipal(now = new Date()): void {
    if (!this.props.activo) {
      throw new BodegaInactiveCannotBePrincipalError(this.props.id);
    }

    if (this.props.esPrincipal) {
      throw new BodegaAlreadyPrincipalError(this.props.id);
    }

    this.props = {
      ...this.props,
      esPrincipal: true,
      actualizadoEn: now,
    };
  }

  unmarkAsPrincipal(now = new Date()): void {
    if (this.props.esPrincipal) {
      this.props = {
        ...this.props,
        esPrincipal: false,
        actualizadoEn: now,
      };
    }
  }

  snapshot(): BodegaProps {
    return { ...this.props };
  }

  get id(): number | undefined {
    return this.props.id;
  }

  get empresaId(): number {
    return this.props.empresaId;
  }

  get codigo(): string {
    return this.props.codigo.value;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get descripcion(): string | null | undefined {
    return this.props.descripcion;
  }

  get direccion(): string | null | undefined {
    return this.props.direccion;
  }

  get telefono(): string | null | undefined {
    return this.props.telefono;
  }

  get esPrincipal(): boolean {
    return this.props.esPrincipal;
  }

  get responsableId(): number | null | undefined {
    return this.props.responsableId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get motivoInactivacion(): string | null | undefined {
    return this.props.motivoInactivacion;
  }

  get inactivadaEn(): Date | null | undefined {
    return this.props.inactivadaEn;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get actualizadoEn(): Date {
    return this.props.actualizadoEn;
  }

  private static normalizeRequiredName(value: string): string {
    const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      throw new InvalidBodegaNameError();
    }
    return normalized;
  }

  private static normalizeNullable(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().replace(/\s+/g, ' ');
    return normalized.length ? normalized : null;
  }
}
