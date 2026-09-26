import { ProductCatalogEntry } from '../inventory.types';

export interface ProductCatalogPort {
  findById(id: number): Promise<ProductCatalogEntry | null>;
}
