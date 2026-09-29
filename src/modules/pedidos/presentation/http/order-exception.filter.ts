import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { OrderError } from '../../domain/errors/order.errors';

const statusByCode: Record<string, HttpStatus> = {
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORDER_VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_INVALID_STATE: HttpStatus.CONFLICT,
  ORDER_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  ORDER_ACTOR_NOT_FOUND: HttpStatus.UNAUTHORIZED,
  ORDER_COMPANY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_FORBIDDEN: HttpStatus.FORBIDDEN,
  ORDER_CUSTOMER_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_VISIT_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_VISIT_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_PRODUCT_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_SELLER_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_CREDIT_APPROVAL_REQUIRED: HttpStatus.CONFLICT,
};

@Catch(OrderError)
export class OrderExceptionFilter implements ExceptionFilter {
  catch(exception: OrderError, host: ArgumentsHost): void {
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
