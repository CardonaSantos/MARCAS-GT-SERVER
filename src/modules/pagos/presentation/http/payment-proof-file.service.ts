import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, Inject } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { randomUUID } from 'node:crypto';
import { UploadFileUseCase, InvalidUploadError } from 'src/modules/archivos';
import { FILE_STORAGE_PORT, FileStoragePort } from 'src/modules/archivos';
import { AddPaymentProofUseCase } from '../../application/use-cases/add-payment-proof.use-case';
import { PaymentActorDirectoryPort } from '../../application/ports/payment-actor-directory.port';
import { PaymentWorkflowPort } from '../../application/ports/payment-workflow.port';
import { PAYMENT_ACTOR_DIRECTORY, PAYMENT_WORKFLOW } from '../../payment.tokens';
import { requirePaymentActor, requireScopedPayment } from '../../application/use-cases/payment.helpers';

@Injectable()
export class PaymentProofFileService {
  private readonly logger = new Logger(PaymentProofFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadFile: UploadFileUseCase,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
    private readonly proofUse: AddPaymentProofUseCase,
    @Inject(PAYMENT_ACTOR_DIRECTORY) private readonly actors: PaymentActorDirectoryPort,
    @Inject(PAYMENT_WORKFLOW) private readonly workflow: PaymentWorkflowPort,
  ) {}

  async upload(input: {
    pagoId: number;
    actorId: number;
    buffer: Buffer;
    filename: string;
    descripcion?: string;
    claveIdempotencia: string;
  }) {
    if (!input.claveIdempotencia || input.claveIdempotencia.length < 8 ||
        input.claveIdempotencia.length > 200) {
      throw new BadRequestException('La clave de idempotencia es obligatoria.');
    }
    if ((input.descripcion ?? '').length > 1000) {
      throw new BadRequestException('La descripción excede el máximo permitido.');
    }

    const actor = await requirePaymentActor(this.actors, input.actorId);
    const payment = await requireScopedPayment(this.workflow, input.pagoId, actor.empresaId);
    await this.authorizeRead(actor, payment.pedidoId);
    if (!['ADMIN', 'CONTABILIDAD', 'VENDEDOR'].includes(actor.rol)) {
      throw new ForbiddenException('No puedes adjuntar comprobantes.');
    }
    if (['RECHAZADO', 'ANULADO'].includes(payment.estado)) {
      throw new BadRequestException('Este pago no admite comprobantes.');
    }
    const previous = await this.prisma.pagoComprobante.findUnique({
      where: { claveIdempotencia: input.claveIdempotencia },
      select: { id: true, pagoId: true, eliminadoEn: true },
    });
    if (previous) {
      if (previous.pagoId !== input.pagoId || previous.eliminadoEn) {
        throw new BadRequestException('Esta operación ya fue utilizada.');
      }
      return { comprobanteId: previous.id, repetido: true };
    }

    let file: { key: string; mimeType: string; size: number; filename: string };
    try {
      file = await this.uploadFile.execute({
        buffer: input.buffer,
        filename: input.filename,
        prefix: 'marcas-gt/empresas/' + actor.empresaId +
          '/pagos/' + input.pagoId + '/comprobantes/',
      });
    } catch (error) {
      if (error instanceof InvalidUploadError) {
        throw new BadRequestException(error.message);
      }
      this.logger.error('No fue posible subir el comprobante a Spaces.', String(error));
      throw new ServiceUnavailableException('No fue posible cargar el archivo.');
    }

    try {
      const proof = await this.proofUse.execute({
        id: input.pagoId,
        actorId: input.actorId,
        url: 'spaces://' + file.key,
        key: file.key,
        mimeType: file.mimeType,
        size: file.size,
        descripcion: input.descripcion?.trim() || file.filename,
        claveIdempotencia: input.claveIdempotencia,
      });
      // Un segundo intento concurrente puede haber reutilizado la clave.
      const stored = await this.prisma.pagoComprobante.findUnique({
        where: { id: proof.id },
        select: { key: true },
      });
      if (stored?.key !== file.key) {
        await this.storage.remove(file.key).catch(() => undefined);
      }
      return { comprobanteId: proof.id, repetido: stored?.key !== file.key };
    } catch (error) {
      await this.storage.remove(file.key).catch((cleanup) => {
        this.logger.warn('Falló la limpieza de una carga no vinculada: ' + String(cleanup));
      });
      throw error;
    }
  }

  async access(pagoId: number, proofId: number, actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    const payment = await requireScopedPayment(this.workflow, pagoId, actor.empresaId);
    await this.authorizeRead(actor, payment.pedidoId);
    const proof = await this.prisma.pagoComprobante.findFirst({
      where: { id: proofId, pagoId, eliminadoEn: null },
      select: { id: true, key: true, mimeType: true, descripcion: true, url: true },
    });
    if (!proof) throw new NotFoundException('El comprobante no existe.');
    if (!proof.key || !this.ownsKey(proof.key, actor.empresaId, pagoId)) {
      // Compatibilidad con URLs antiguas, no administradas por Spaces.
      return { url: proof.url, mimeType: proof.mimeType, descripcion: proof.descripcion };
    }
    try {
      return {
        url: await this.storage.signedReadUrl(proof.key, 60),
        mimeType: proof.mimeType,
        descripcion: proof.descripcion,
      };
    } catch (error) {
      this.logger.error('No fue posible generar enlace de lectura.', String(error));
      throw new ServiceUnavailableException('No fue posible abrir el comprobante.');
    }
  }

  async remove(pagoId: number, proofId: number, actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    if (actor.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede eliminar comprobantes de pago.');
    }
    await requireScopedPayment(this.workflow, pagoId, actor.empresaId);
    const proof = await this.prisma.pagoComprobante.findFirst({
      where: { id: proofId, pagoId, eliminadoEn: null },
      select: { key: true },
    });
    if (!proof) throw new NotFoundException('El comprobante no existe.');

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pagoComprobante.updateMany({
        where: { id: proofId, pagoId, eliminadoEn: null },
        data: { eliminadoEn: new Date(), eliminadoPorId: actor.id },
      });
      if (updated.count !== 1) {
        throw new NotFoundException('El comprobante ya fue eliminado.');
      }
      const updatedPayment = await tx.pago.update({
        where: { id: pagoId },
        data: { version: { increment: 1 } },
        select: { estado: true },
      });
      await tx.pagoEvento.create({
        data: {
          pagoId, usuarioId: actor.id, estado: updatedPayment.estado,
          tipo: 'OBSERVACION', detalle: 'Comprobante retirado por ADMIN.',
          referenciaTipo: 'PAGO_COMPROBANTE_ELIMINADO', referenciaId: proofId,
          claveIdempotencia: 'proof-delete:' + proofId + ':' + randomUUID(),
          metadata: { comprobanteId: proofId, accion: 'ELIMINACION' },
        },
      });
    });

    let storageDeleted = true;
    if (proof.key && this.ownsKey(proof.key, actor.empresaId, pagoId)) {
      try {
        await this.storage.remove(proof.key);
      } catch (error) {
        storageDeleted = false;
        this.logger.error('Pendiente de limpieza en Spaces para comprobante ' + proofId, String(error));
      }
    }
    return { eliminado: true, storageDeleted };
  }

  private ownsKey(key: string, empresaId: number, pagoId: number): boolean {
    return key.startsWith('marcas-gt/empresas/' + empresaId +
      '/pagos/' + pagoId + '/comprobantes/');
  }

  private async authorizeRead(
    actor: { id: number; rol: string; empresaId: number },
    pedidoId: number | null,
  ) {
    if (actor.rol !== 'VENDEDOR') {
      if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
        throw new ForbiddenException('No tienes acceso a este comprobante.');
      }
      return;
    }
    if (!pedidoId) throw new ForbiddenException('Pedido no disponible.');
    const order = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId: actor.empresaId, vendedorId: actor.id },
      select: { id: true },
    });
    if (!order) throw new ForbiddenException('El pago no pertenece a tus pedidos.');
  }
}
