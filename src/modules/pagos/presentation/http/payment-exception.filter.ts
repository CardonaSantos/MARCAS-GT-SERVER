import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  PaymentAvailableAmountExceededError,
  PaymentConcurrentModificationError,
  PaymentDomainError,
  PaymentForbiddenError,
  PaymentIdempotencyConflictError,
  PaymentInvalidStateError,
  PaymentNotFoundError,
  PaymentValidationError,
  ReceivableBalanceExceededError,
} from '../../domain/errors/payment.errors';

@Catch(PaymentDomainError)
export class PaymentExceptionFilter implements ExceptionFilter {
  catch(exception: PaymentDomainError, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse() as Response;
    const request = context.getRequest() as Request;

    let status = HttpStatus.BAD_REQUEST;

    if (exception instanceof PaymentNotFoundError) {
      status = HttpStatus.NOT_FOUND;
    } else if (exception instanceof PaymentForbiddenError) {
      status = HttpStatus.FORBIDDEN;
    } else if (exception instanceof PaymentValidationError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    } else if (
      exception instanceof PaymentInvalidStateError ||
      exception instanceof PaymentIdempotencyConflictError ||
      exception instanceof PaymentAvailableAmountExceededError ||
      exception instanceof ReceivableBalanceExceededError ||
      exception instanceof PaymentConcurrentModificationError
    ) {
      status = HttpStatus.CONFLICT;
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
