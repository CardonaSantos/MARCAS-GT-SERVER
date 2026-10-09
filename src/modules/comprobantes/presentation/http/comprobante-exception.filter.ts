import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ComprobanteError } from '../../domain/comprobante.errors';

@Catch(ComprobanteError)
export class ComprobanteExceptionFilter implements ExceptionFilter {
  catch(error: ComprobanteError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = {
      ACTOR_INVALIDO: HttpStatus.UNAUTHORIZED,
      NO_ENCONTRADO: HttpStatus.NOT_FOUND,
      NO_EMITIBLE: HttpStatus.CONFLICT,
      CONFLICTO: HttpStatus.CONFLICT,
    }[error.code] ?? HttpStatus.BAD_REQUEST;
    response.status(status).json({
      statusCode: status, code: error.code, message: error.message,
    });
  }
}
