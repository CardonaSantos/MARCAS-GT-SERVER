import { RequisitionDirectoryEntry } from '../models/requisition.models';

export interface RequisitionDirectoryPort {
  findById(id: number): Promise<RequisitionDirectoryEntry | null>;
}
