import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TransferError } from '../../domain/errors/transfer.errors';

const statusByCode: Record<string, HttpStatus> = {
  TRANSFER_NOT_FOUND: HttpStatus.NOT_FOUND,
  TRANSFER_INVALID_STATE: HttpStatus.CONFLICT,
  TRANSFER_VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  TRANSFER_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  TRANSFER_OPERATION_CONFLICT: HttpStatus.CONFLICT,
  TRANSFER_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  TRANSFER_INSUFFICIENT_AVAILABILITY: HttpStatus.CONFLICT,
  TRANSFER_INVENTORY_OPERATION_FAILED: HttpStatus.CONFLICT,
  TRANSFER_INVENTORY_CONTRACT_ERROR: HttpStatus.BAD_GATEWAY,
};

@Catch(TransferError)
export class TransferExceptionFilter implements ExceptionFilter {
  catch(exception: TransferError, host: ArgumentsHost): void {
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
