import { BodegaQueryPort } from '../ports/bodega-query.port';

export class GetBodegaOverviewUseCase {
  constructor(private readonly query: BodegaQueryPort) {}

  execute() {
    return this.query.getOverview();
  }
}
