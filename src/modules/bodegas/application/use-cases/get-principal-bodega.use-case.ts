import { BodegaQueryPort } from '../ports/bodega-query.port';

export class GetPrincipalBodegaUseCase {
  constructor(private readonly query: BodegaQueryPort) {}

  execute() {
    return this.query.getPrincipal();
  }
}
