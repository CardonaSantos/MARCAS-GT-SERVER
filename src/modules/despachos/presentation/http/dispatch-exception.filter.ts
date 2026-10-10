import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DispatchError } from '../../domain/errors/dispatch.errors';

const statusByCode: Record<string, HttpStatus> = {
  DISPATCH_NOT_FOUND: HttpStatus.NOT_FOUND,
  DISPATCH_VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  DISPATCH_INVALID_STATE: HttpStatus.CONFLICT,
  DISPATCH_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  DISPATCH_ACTOR_NOT_FOUND: HttpStatus.UNAUTHORIZED,
  DISPATCH_COMPANY_REQUIRED: HttpStatus.FORBIDDEN,
  DISPATCH_FORBIDDEN: HttpStatus.FORBIDDEN,
  DISPATCH_ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  DISPATCH_ORDER_NOT_ELIGIBLE: HttpStatus.CONFLICT,
  DISPATCH_WAREHOUSE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DISPATCH_WAREHOUSE_INACTIVE: HttpStatus.CONFLICT,
  DISPATCH_WAREHOUSE_COMPANY_MISMATCH: HttpStatus.FORBIDDEN,
  DISPATCH_QUANTITY_EXCEEDED: HttpStatus.CONFLICT,
  DISPATCH_INSUFFICIENT_AVAILABILITY: HttpStatus.CONFLICT,
  DISPATCH_OPERATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  DISPATCH_OPERATION_CONFLICT: HttpStatus.CONFLICT,
  DISPATCH_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  DISPATCH_INVENTORY_OPERATION_FAILED: HttpStatus.CONFLICT,
  DISPATCH_INVENTORY_CONTRACT_ERROR: HttpStatus.BAD_GATEWAY,
  DISPATCH_ORDER_INTEGRATION_FAILED: HttpStatus.CONFLICT,
  DISPATCH_OPERATION_NOT_RETRYABLE: HttpStatus.CONFLICT,
  DISPATCH_FAILED_OPERATION_PENDING_RETRY: HttpStatus.CONFLICT,
};

@Catch(DispatchError)
export class DispatchExceptionFilter implements ExceptionFilter {
  catch(exception: DispatchError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse() as Response;
    const request = ctx.getRequest() as Request;
    const status =
      statusByCode[exception.code] ?? HttpStatus.BAD_REQUEST;

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
