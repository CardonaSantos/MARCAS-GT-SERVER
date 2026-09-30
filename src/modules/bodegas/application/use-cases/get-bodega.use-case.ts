import { BodegaNotFoundError } from '../../domain/errors/bodega.errors';
import { BodegaQueryPort } from '../ports/bodega-query.port';

export class GetBodegaUseCase {
  constructor(private readonly query: BodegaQueryPort) {}

  async execute(id: number) {
    const result = await this.query.getById(id);
    if (!result) throw new BodegaNotFoundError(id);
    return result;
  }
}
