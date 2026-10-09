import { Inject, Injectable, Logger } from '@nestjs/common';
import { CREDIT_PAYMENT_PLAN_REPOSITORY } from '../../credit.tokens';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma.service';
import { CreditPaymentPlanRepositoryPort } from '../../domain/ports/credit.repositories';

/**
 * Activa automáticamente borradores autorizados cuando el pedido está ENTREGADO.
 * Usa la operación transaccional/idempotente ya probada de CréditoPlanPago.
 */
@Injectable()
export class CreditPlanAutoActivationService {
  private readonly logger = new Logger(CreditPlanAutoActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CREDIT_PAYMENT_PLAN_REPOSITORY)
    private readonly plans: CreditPaymentPlanRepositoryPort,
  ) {}

  async activateForOrder(pedidoId: number, empresaId: number): Promise<boolean> {
    const plan = await this.prisma.creditoPlanPago.findFirst({
      where: {
        empresaId,
        estado: 'BORRADOR',
        credito: {
          estado: 'ACTIVO',
          solicitudOrigen: {
            pedidoId,
            pedido: { estado: 'ENTREGADO', empresaId },
          },
        },
      },
      select: {
        creditoId: true,
        empresaId: true,
        version: true,
        creadoPorId: true,
        credito: { select: { aprobadoPorId: true } },
      },
    });
    if (!plan) return false;
    const actorId = plan.credito.aprobadoPorId ?? plan.creadoPorId;
    if (!actorId) {
      this.logger.warn('Plan sin aprobador o creador: credito ' + plan.creditoId);
      return false;
    }
    await this.plans.activatePaymentPlan({
      creditoId: plan.creditoId,
      empresaId: plan.empresaId,
      expectedVersion: plan.version,
      actorId,
      claveIdempotencia: 'credit-plan:delivery:' + plan.creditoId,
    });
    return true;
  }

  /** Recupera fallos temporales sin requerir otra intervención contable. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileDeliveredCredits(): Promise<void> {
    const pending = await this.prisma.creditoPlanPago.findMany({
      where: {
        estado: 'BORRADOR',
        credito: {
          estado: 'ACTIVO',
          solicitudOrigen: { pedido: { estado: 'ENTREGADO' } },
        },
      },
      take: 100,
      select: {
        empresaId: true,
        credito: { select: { solicitudOrigen: { select: { pedidoId: true } } } },
      },
    });
    for (const row of pending) {
      const orderId = row.credito.solicitudOrigen?.pedidoId;
      if (!orderId) continue;
      try {
        await this.activateForOrder(orderId, row.empresaId);
      } catch (error) {
        this.logger.error('Falló activación automática del pedido ' + orderId, error);
      }
    }
  }
}
