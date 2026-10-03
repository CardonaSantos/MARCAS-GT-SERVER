import { Injectable } from '@nestjs/common';
import {
  FelProviderDocument,
  FelProviderPort,
  FelProviderResult,
} from '../../../application/ports/fel-provider.port';
import { FelProviderConfig } from '../../../application/ports/fiscal-config.port';
import { FelIntegrationPendingError } from '../../../domain/errors/billing.errors';

@Injectable()
export class GrupoCdsFelAdapter implements FelProviderPort {
  readonly code = 'GRUPO_CDS';

  async isConfigured(_config: FelProviderConfig): Promise<boolean> {
    // La integración real queda pendiente de credenciales, cotización y contrato vigente.
    return false;
  }

  async certify(
    _config: FelProviderConfig,
    _document: FelProviderDocument,
  ): Promise<FelProviderResult> {
    throw new FelIntegrationPendingError({ provider: this.code });
  }

  async reconcile(
    _config: FelProviderConfig,
    _document: FelProviderDocument,
  ): Promise<FelProviderResult> {
    throw new FelIntegrationPendingError({ provider: this.code });
  }
}
