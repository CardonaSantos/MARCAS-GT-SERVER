import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe,
  Post, UploadedFile, UseFilters, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { PaymentExceptionFilter } from './payment-exception.filter';
import { PaymentProofFileService } from './payment-proof-file.service';

type UploadedPaymentFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('pagos/:pagoId/comprobantes')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(PaymentExceptionFilter)
export class PaymentProofFileController {
  constructor(private readonly media: PaymentProofFileService) {}

  @Post('archivo')
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  @UseInterceptors(FileInterceptor('archivo', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  upload(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @CurrentActorId() actorId: number,
    @UploadedFile() archivo: UploadedPaymentFile,
    @Body('descripcion') descripcion: string | undefined,
    @Body('claveIdempotencia') claveIdempotencia: string,
  ) {
    if (!archivo) {
      throw new BadRequestException('Selecciona una imagen o PDF.');
    }
    return this.media.upload({
      pagoId, actorId, buffer: archivo.buffer, filename: archivo.originalname,
      descripcion, claveIdempotencia,
    });
  }

  @Get(':comprobanteId/archivo')
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  access(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Param('comprobanteId', ParseIntPipe) comprobanteId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.media.access(pagoId, comprobanteId, actorId);
  }

  @Delete(':comprobanteId')
  @Roles('ADMIN')
  remove(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Param('comprobanteId', ParseIntPipe) comprobanteId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.media.remove(pagoId, comprobanteId, actorId);
  }
}
