import { TransportCatalogRepositoryPort } from '../../domain/ports/transport-catalog.repository.port';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import { TransportQueryPort } from '../ports/transport-query.port';
import {
  TransportResourceNotFoundError,
  TransportResourceUnavailableError,
} from '../../domain/errors/transport.errors';
import {
  assertPlanner,
  requireTransportActor,
  transportReadScope,
} from './transport.helpers';
export class CreateCarrierUseCase {
  constructor(
    private readonly repo: TransportCatalogRepositoryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    return this.repo.createCarrier({ ...input, empresaId: a.empresaId });
  }
}
export class CreateVehicleUseCase {
  constructor(
    private readonly repo: TransportCatalogRepositoryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    return this.repo.createVehicle({ ...input, empresaId: a.empresaId });
  }
}
export class CreateDriverUseCase {
  constructor(
    private readonly repo: TransportCatalogRepositoryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    return this.repo.createDriver({ ...input, empresaId: a.empresaId });
  }
}
export class DeactivateTransportResourceUseCase {
  constructor(
    private readonly repo: TransportCatalogRepositoryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async carrier(id: number, reason: string, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    const r = await this.repo.findCarrier(id);
    if (!r) throw new TransportResourceNotFoundError('TRANSPORTISTA', id);
    if (r.empresaId !== a.empresaId)
      throw new TransportResourceUnavailableError('TRANSPORTISTA', id);
    return this.repo.deactivateCarrier(id, reason);
  }
  async vehicle(id: number, reason: string, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    const r = await this.repo.findVehicle(id);
    if (!r) throw new TransportResourceNotFoundError('VEHICULO', id);
    if (
      r.empresaId !== a.empresaId ||
      ['RESERVADO', 'EN_RUTA'].includes(r.estado)
    )
      throw new TransportResourceUnavailableError('VEHICULO', id, r.estado);
    return this.repo.deactivateVehicle(id, reason);
  }
  async driver(id: number, reason: string, actorId: number) {
    const a = await requireTransportActor(this.actors, actorId);
    assertPlanner(a);
    const r = await this.repo.findDriver(id);
    if (!r) throw new TransportResourceNotFoundError('CONDUCTOR', id);
    if (
      r.empresaId !== a.empresaId ||
      ['ASIGNADO', 'EN_RUTA'].includes(r.estado)
    )
      throw new TransportResourceUnavailableError('CONDUCTOR', id, r.estado);
    return this.repo.deactivateDriver(id, reason);
  }
}
export class ListTransportCatalogUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async carriers(f: any, id: number) {
    const a = await requireTransportActor(this.actors, id);
    return this.query.listCarriers(transportReadScope(a), f);
  }
  async vehicles(f: any, id: number) {
    const a = await requireTransportActor(this.actors, id);
    return this.query.listVehicles(transportReadScope(a), f);
  }
  async drivers(f: any, id: number) {
    const a = await requireTransportActor(this.actors, id);
    return this.query.listDrivers(transportReadScope(a), f);
  }
}
