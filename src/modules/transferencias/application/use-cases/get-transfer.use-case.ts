import { TransferNotFoundError } from '../../domain/errors/transfer.errors';
import { TransferQueryPort } from '../ports/transfer-query.port';

export class GetTransferUseCase {
  constructor(private readonly query: TransferQueryPort) {}

  async execute(id: number) {
    const result = await this.query.getById(id);
    if (!result) throw new TransferNotFoundError(id);
    return result;
  }
}
