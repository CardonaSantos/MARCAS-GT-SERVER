import { BodegaNotFoundError } from '../../domain/errors/bodega.errors';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { BodegaEventFilters } from '../models/bodega.models';
import { BodegaQueryPort } from '../ports/bodega-query.port';

export class ListBodegaEventsUseCase {
  constructor(
    private readonly repository: BodegaRepositoryPort,
    private readonly query: BodegaQueryPort,
  ) {}

  async execute(id: number, filters: BodegaEventFilters) {
    if (!(await this.repository.findById(id))) {
      throw new BodegaNotFoundError(id);
    }
    return this.query.listEvents(id, filters);
  }
}
