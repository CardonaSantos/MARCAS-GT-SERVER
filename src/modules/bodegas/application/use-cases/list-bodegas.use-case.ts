import { BodegaListFilters } from '../models/bodega.models';
import { BodegaQueryPort } from '../ports/bodega-query.port';

export class ListBodegasUseCase {
  constructor(private readonly query: BodegaQueryPort) {}

  execute(filters: BodegaListFilters) {
    return this.query.list(filters);
  }
}
