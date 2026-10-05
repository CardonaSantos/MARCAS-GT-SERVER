import { Body, Controller, Post } from '@nestjs/common';
import { LocationService } from './location.service';

/**
 * LEGACY LOCATION
 *
 * El tracking de ubicación anterior queda fuera de operación.
 * Este controller conserva únicamente las acciones comerciales que todavía
 * viven en el módulo legacy hasta que sean extraídas a su propio contexto.
 *
 * El tracking oficial vive en:
 * /real-time-location/tracking/*
 */
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('/create-discount-from-request')
  createDiscountFromRequest(
    @Body()
    body: {
      porcentaje: number;
      clienteId: number;
      vendedorId: number;
      requestId: number;
    },
  ) {
    const { porcentaje, clienteId, vendedorId, requestId } = body;

    return this.locationService.createDiscountFromRequest(
      porcentaje,
      clienteId,
      vendedorId,
      requestId,
    );
  }

  @Post('/delete-discount-regist')
  deleteDiscountRegist(
    @Body()
    body: {
      vendedorId: number;
      requestId: number;
    },
  ) {
    const { vendedorId, requestId } = body;

    return this.locationService.deleteDiscountRegist(vendedorId, requestId);
  }
}
