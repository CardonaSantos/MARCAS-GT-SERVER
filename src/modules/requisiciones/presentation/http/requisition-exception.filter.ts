import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { RequisitionError } from '../../domain/errors/requisition.errors';

const statusByCode: Record<string, HttpStatus> = {
  REQUISITION_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUISITION_INVALID_STATE: HttpStatus.CONFLICT,
  REQUISITION_VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  REQUISITION_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  REQUISITION_RECEIPT_CONFLICT: HttpStatus.CONFLICT,
  REQUISITION_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
};

@Catch(RequisitionError)
export class RequisitionExceptionFilter implements ExceptionFilter {
  catch(exception: RequisitionError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse() as Response;
    const request = ctx.getRequest() as Request;
    const status = statusByCode[exception.code] ?? HttpStatus.BAD_REQUEST;
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
