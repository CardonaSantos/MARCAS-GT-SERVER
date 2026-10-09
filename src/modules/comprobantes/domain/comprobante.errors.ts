export type ComprobanteErrorCode = 'ACTOR_INVALIDO' | 'NO_ENCONTRADO' | 'NO_EMITIBLE' | 'CONFLICTO';
export class ComprobanteError extends Error {
  constructor(
    public readonly code: ComprobanteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ComprobanteError';
  }
}
