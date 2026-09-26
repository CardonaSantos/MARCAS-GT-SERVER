import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  InventoryError,
  InventoryErrorCode,
} from '../../domain/errors/inventory.errors';

const STATUS_BY_CODE: Record<InventoryErrorCode, HttpStatus> = {
  INVENTORY_STOCK_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVENTORY_PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVENTORY_BODEGA_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVENTORY_BODEGA_INACTIVE: HttpStatus.CONFLICT,
  INVENTORY_INVALID_QUANTITY: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_INVALID_COST: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_INSUFFICIENT_AVAILABLE_STOCK: HttpStatus.CONFLICT,
  INVENTORY_INSUFFICIENT_RESERVED_STOCK: HttpStatus.CONFLICT,
  INVENTORY_RESERVATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVENTORY_RESERVATION_CLOSED: HttpStatus.CONFLICT,
  INVENTORY_RESERVATION_QUANTITY_EXCEEDED: HttpStatus.CONFLICT,
  INVENTORY_ORDER_DETAIL_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVENTORY_ORDER_DETAIL_CAPACITY_EXCEEDED: HttpStatus.CONFLICT,
  INVENTORY_CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  INVENTORY_INVALID_ADJUSTMENT_REASON: HttpStatus.UNPROCESSABLE_ENTITY,
  INVENTORY_INVALID_REFERENCE: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(InventoryError)
export class InventoryExceptionFilter implements ExceptionFilter {
  catch(exception: InventoryError, host: ArgumentsHost): void {
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
