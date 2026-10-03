import { Injectable } from '@nestjs/common';
import {
  FelProviderPort,
  FelProviderRegistryPort,
} from '../../application/ports/fel-provider.port';
import { GrupoCdsFelAdapter } from './grupo-cds/grupo-cds-fel.adapter';

@Injectable()
export class FelProviderRegistryAdapter implements FelProviderRegistryPort {
  private readonly providers = new Map<string, FelProviderPort>();

  constructor(grupoCds: GrupoCdsFelAdapter) {
    this.providers.set(grupoCds.code, grupoCds);
  }

  resolve(code: string): FelProviderPort | null {
    return this.providers.get(code.trim().toUpperCase()) ?? null;
  }
}
