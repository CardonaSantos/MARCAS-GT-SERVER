import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TransportError } from '../../domain/errors/transport.errors';
const statusByCode: Record<string, HttpStatus> = {
  TRANSPORT_NOT_FOUND: 404,
  TRANSPORT_VALIDATION_ERROR: 422,
  TRANSPORT_INVALID_STATE: 409,
  TRANSPORT_FORBIDDEN: 403,
  TRANSPORT_ACTOR_NOT_FOUND: 401,
  TRANSPORT_COMPANY_REQUIRED: 403,
  TRANSPORT_DISPATCH_NOT_FOUND: 404,
  TRANSPORT_DISPATCH_NOT_ELIGIBLE: 409,
  TRANSPORT_QUANTITY_EXCEEDED: 409,
  TRANSPORT_RESOURCE_UNAVAILABLE: 409,
  TRANSPORT_RESOURCE_NOT_FOUND: 404,
  TRANSPORT_CONCURRENT_MODIFICATION: 409,
  TRANSPORT_IDEMPOTENCY_CONFLICT: 409,
  TRANSPORT_INCIDENT_NOT_FOUND: 404,
};
@Catch(TransportError)
export class TransportExceptionFilter implements ExceptionFilter {
  catch(e: TransportError, host: ArgumentsHost) {
    const c = host.switchToHttp(),
      res = c.getResponse() as Response,
      req = c.getRequest() as Request,
      status = statusByCode[e.code] ?? 400;
    res
      .status(status)
      .json({
        statusCode: status,
        code: e.code,
        message: e.message,
        details: e.details ?? null,
        timestamp: new Date().toISOString(),
        path: req.url,
      });
  }
}
