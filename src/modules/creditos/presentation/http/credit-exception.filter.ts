import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { CreditError } from '../../domain/errors/credit.errors';

const statusByCode: Record<string, HttpStatus> = {
  CREDIT_APPLICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CREDIT_POLICY_NOT_FOUND: HttpStatus.NOT_FOUND,
  CREDIT_ACTOR_NOT_FOUND: HttpStatus.UNAUTHORIZED,
  CREDIT_COMPANY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  CREDIT_FORBIDDEN: HttpStatus.FORBIDDEN,
  CREDIT_VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  CREDIT_INVALID_STATE: HttpStatus.CONFLICT,
  CREDIT_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  CREDIT_ACTIVE_APPLICATION_EXISTS: HttpStatus.CONFLICT,
  CREDIT_ORDER_INVALID: HttpStatus.CONFLICT,
  CREDIT_POLICY_INACTIVE: HttpStatus.CONFLICT,
  CREDIT_DECISION_NOT_READY: HttpStatus.CONFLICT,
  CREDIT_ALREADY_DECIDED: HttpStatus.CONFLICT,
  CREDIT_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  CREDIT_INTEGRATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CREDIT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CREDIT_PAYMENT_PLAN_NOT_FOUND: HttpStatus.NOT_FOUND,
  CREDIT_PAYMENT_PLAN_EXISTS: HttpStatus.CONFLICT,
};

@Catch(CreditError)
export class CreditExceptionFilter implements ExceptionFilter {
  catch(exception: CreditError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
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
