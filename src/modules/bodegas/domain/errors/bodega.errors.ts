export type BodegaErrorCode =
  | 'BODEGA_NOT_FOUND'
  | 'BODEGA_CODE_CONFLICT'
  | 'BODEGA_INVALID_CODE'
  | 'BODEGA_INVALID_NAME'
  | 'BODEGA_ALREADY_ACTIVE'
  | 'BODEGA_ALREADY_INACTIVE'
  | 'BODEGA_ALREADY_PRINCIPAL'
  | 'BODEGA_PRINCIPAL_CANNOT_BE_DEACTIVATED'
  | 'BODEGA_INACTIVE_CANNOT_BE_PRINCIPAL'
  | 'BODEGA_INVALID_DEACTIVATION_REASON'
  | 'BODEGA_HAS_OPERATIONAL_DEPENDENCIES'
  | 'BODEGA_INVALID_RESPONSIBLE'
  | 'BODEGA_NO_CHANGES'
  | 'BODEGA_COMPANY_CONTEXT_INVALID';

export class BodegaError extends Error {
  constructor(
    public readonly code: BodegaErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BodegaNotFoundError extends BodegaError {
  constructor(id: number) {
    super('BODEGA_NOT_FOUND', `No existe la bodega con id ${id}.`, { id });
  }
}

export class BodegaCodeConflictError extends BodegaError {
  constructor(code: string) {
    super(
      'BODEGA_CODE_CONFLICT',
      `Ya existe una bodega con el código ${code}.`,
      { code },
    );
  }
}

export class InvalidBodegaCodeError extends BodegaError {
  constructor(message: string) {
    super('BODEGA_INVALID_CODE', message);
  }
}

export class InvalidBodegaNameError extends BodegaError {
  constructor() {
    super('BODEGA_INVALID_NAME', 'El nombre de la bodega es obligatorio.');
  }
}

export class BodegaAlreadyActiveError extends BodegaError {
  constructor(id?: number) {
    super('BODEGA_ALREADY_ACTIVE', 'La bodega ya se encuentra activa.', { id });
  }
}

export class BodegaAlreadyInactiveError extends BodegaError {
  constructor(id?: number) {
    super('BODEGA_ALREADY_INACTIVE', 'La bodega ya se encuentra inactiva.', {
      id,
    });
  }
}

export class BodegaAlreadyPrincipalError extends BodegaError {
  constructor(id?: number) {
    super(
      'BODEGA_ALREADY_PRINCIPAL',
      'La bodega ya está establecida como principal.',
      { id },
    );
  }
}

export class BodegaPrincipalCannotBeDeactivatedError extends BodegaError {
  constructor(id?: number) {
    super(
      'BODEGA_PRINCIPAL_CANNOT_BE_DEACTIVATED',
      'La bodega principal no puede desactivarse. Establece otra bodega como principal primero.',
      { id },
    );
  }
}

export class BodegaInactiveCannotBePrincipalError extends BodegaError {
  constructor(id?: number) {
    super(
      'BODEGA_INACTIVE_CANNOT_BE_PRINCIPAL',
      'Una bodega inactiva no puede establecerse como principal.',
      { id },
    );
  }
}

export class InvalidBodegaDeactivationReasonError extends BodegaError {
  constructor() {
    super(
      'BODEGA_INVALID_DEACTIVATION_REASON',
      'Debes indicar un motivo de inactivación de al menos 3 caracteres.',
    );
  }
}

export class BodegaHasOperationalDependenciesError extends BodegaError {
  constructor(details: Record<string, unknown>) {
    super(
      'BODEGA_HAS_OPERATIONAL_DEPENDENCIES',
      'La bodega tiene dependencias operativas y no puede desactivarse.',
      details,
    );
  }
}

export class InvalidBodegaResponsibleError extends BodegaError {
  constructor(userId: number, reason: string) {
    super('BODEGA_INVALID_RESPONSIBLE', reason, { userId });
  }
}

export class BodegaNoChangesError extends BodegaError {
  constructor() {
    super('BODEGA_NO_CHANGES', 'No se recibieron cambios para actualizar.');
  }
}

export class BodegaCompanyContextInvalidError extends BodegaError {
  constructor(found: number) {
    super(
      'BODEGA_COMPANY_CONTEXT_INVALID',
      'La base de datos debe contener exactamente una empresa configurada.',
      { empresasEncontradas: found },
    );
  }
}
