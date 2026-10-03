import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  BillingConcurrentModificationError,
  BillingDomainError,
  BillingForbiddenError,
  BillingIdempotencyConflictError,
  BillingInvalidStateError,
  BillingNotFoundError,
  BillingValidationError,
  BillableQuantityExceededError,
  FelIntegrationPendingError,
  FiscalConfigurationError,
} from '../../domain/errors/billing.errors';

@Catch(BillingDomainError)
export class BillingExceptionFilter implements ExceptionFilter {
  catch(exception: BillingDomainError, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse() as Response;
    const request = context.getRequest() as Request;

    let status = HttpStatus.BAD_REQUEST;
    if (exception instanceof BillingNotFoundError) status = HttpStatus.NOT_FOUND;
    else if (exception instanceof BillingForbiddenError) status = HttpStatus.FORBIDDEN;
    else if (
      exception instanceof BillingValidationError ||
      exception instanceof FiscalConfigurationError
    ) status = HttpStatus.UNPROCESSABLE_ENTITY;
    else if (
      exception instanceof BillingInvalidStateError ||
      exception instanceof BillingConcurrentModificationError ||
      exception instanceof BillingIdempotencyConflictError ||
      exception instanceof BillableQuantityExceededError
    ) status = HttpStatus.CONFLICT;
    else if (exception instanceof FelIntegrationPendingError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
    }

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
