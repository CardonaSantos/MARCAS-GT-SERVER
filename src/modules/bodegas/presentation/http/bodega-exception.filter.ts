import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BodegaError, BodegaErrorCode } from '../../domain/errors/bodega.errors';

const STATUS_BY_CODE: Record<BodegaErrorCode, HttpStatus> = {
  BODEGA_NOT_FOUND: HttpStatus.NOT_FOUND,
  BODEGA_CODE_CONFLICT: HttpStatus.CONFLICT,
  BODEGA_INVALID_CODE: HttpStatus.UNPROCESSABLE_ENTITY,
  BODEGA_INVALID_NAME: HttpStatus.UNPROCESSABLE_ENTITY,
  BODEGA_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  BODEGA_ALREADY_INACTIVE: HttpStatus.CONFLICT,
  BODEGA_ALREADY_PRINCIPAL: HttpStatus.CONFLICT,
  BODEGA_PRINCIPAL_CANNOT_BE_DEACTIVATED: HttpStatus.CONFLICT,
  BODEGA_INACTIVE_CANNOT_BE_PRINCIPAL: HttpStatus.CONFLICT,
  BODEGA_INVALID_DEACTIVATION_REASON: HttpStatus.UNPROCESSABLE_ENTITY,
  BODEGA_HAS_OPERATIONAL_DEPENDENCIES: HttpStatus.CONFLICT,
  BODEGA_INVALID_RESPONSIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  BODEGA_NO_CHANGES: HttpStatus.UNPROCESSABLE_ENTITY,
  BODEGA_COMPANY_CONTEXT_INVALID: HttpStatus.INTERNAL_SERVER_ERROR,
};

@Catch(BodegaError)
export class BodegaExceptionFilter implements ExceptionFilter {
  catch(exception: BodegaError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse() as Response;
    const request = ctx.getRequest() as Request;
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
      details: exception.details ?? null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
