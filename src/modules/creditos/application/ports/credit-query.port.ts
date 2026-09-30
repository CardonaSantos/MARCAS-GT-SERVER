import {
  CreditDetailView,
  CreditEventFilters,
  CreditEventPage,
  CreditListFilters,
  CreditPage,
  CreditPolicyPage,
  CreditPolicyView,
  CreditPortfolioFilters,
  CreditPortfolioPage,
  CreditScope,
  CreditSummaryFilters,
  CreditSummaryView,
} from '../models/credit.models';
export interface CreditQueryPort {
  list(filters: CreditListFilters): Promise<CreditPage>;
  getById(id: number, scope: CreditScope): Promise<CreditDetailView | null>;
  listEvents(id: number, filters: CreditEventFilters): Promise<CreditEventPage>;
  getSummary(filters: CreditSummaryFilters): Promise<CreditSummaryView>;
  listPortfolio(filters: CreditPortfolioFilters): Promise<CreditPortfolioPage>;
  listPolicies(filters: {
    page: number;
    limit: number;
    search?: string;
    activo?: boolean;
    empresaId: number;
  }): Promise<CreditPolicyPage>;
  getPolicy(id: number, empresaId: number): Promise<CreditPolicyView | null>;
}
