import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpireTrackingUseCase } from '../application/use-cases/tracking.use-cases';

@Injectable()
export class TrackingExpirationScheduler {
  private readonly logger = new Logger(TrackingExpirationScheduler.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly expireTracking: ExpireTrackingUseCase,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, {
    timeZone: 'America/Guatemala',
  })
  async handleExpiration(): Promise<void> {
    if (this.running) return;

    this.running = true;

    try {
      const configured = Number(
        this.config.get<string>('TRACKING_STALE_AFTER_MINUTES') ?? '120',
      );

      const staleMinutes =
        Number.isFinite(configured) && configured >= 20 ? configured : 120;

      const before = new Date(Date.now() - staleMinutes * 60_000);
      const expired = await this.expireTracking.execute(before, 200);

      if (expired > 0) {
        this.logger.log('Sesiones de tracking expiradas: ' + expired);
      }
    } catch (error) {
      this.logger.error(
        'Falló la expiración automática de tracking.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
