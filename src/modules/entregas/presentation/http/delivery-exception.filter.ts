import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  DeliveryConcurrentModificationError,
  DeliveryForbiddenError,
  DeliveryIdempotencyConflictError,
  DeliveryInvalidStateError,
  DeliveryNotFoundError,
  DeliveryValidationError,
  DeliveryDomainError,
} from '../../domain/errors/delivery.errors';

@Catch(DeliveryDomainError)
export class DeliveryExceptionFilter implements ExceptionFilter {
  catch(exception: DeliveryDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse() as Response;
    const request = ctx.getRequest() as Request;
    let status = HttpStatus.BAD_REQUEST;
    if (exception instanceof DeliveryNotFoundError) status = HttpStatus.NOT_FOUND;
    else if (exception instanceof DeliveryForbiddenError) status = HttpStatus.FORBIDDEN;
    else if (exception instanceof DeliveryValidationError) status = HttpStatus.UNPROCESSABLE_ENTITY;
    else if (
      exception instanceof DeliveryInvalidStateError ||
      exception instanceof DeliveryConcurrentModificationError ||
      exception instanceof DeliveryIdempotencyConflictError
    ) status = HttpStatus.CONFLICT;

    response.status(status).json({
      statusCode: status,
      code: exception.name,
      message: exception.message,
      details: exception.details ?? null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
