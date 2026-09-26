import { BodegaSelectQuery } from '../models/bodega.models';
import { BodegaQueryPort } from '../ports/bodega-query.port';

export class ListBodegaSelectablesUseCase {
  constructor(private readonly query: BodegaQueryPort) {}

  execute(query: BodegaSelectQuery) {
    return this.query.listSelectables(query);
  }
}
