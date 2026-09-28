import { RequisitionNotFoundError } from '../../domain/errors/requisition.errors';
import { RequisitionQueryPort } from '../ports/requisition-query.port';
export class GetRequisitionUseCase {
  constructor(private readonly query: RequisitionQueryPort) {}
  async execute(id: number) {
    const result = await this.query.getById(id);
    if (!result) throw new RequisitionNotFoundError(id);
    return result;
  }
}
