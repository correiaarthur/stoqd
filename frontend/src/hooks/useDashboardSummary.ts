import { getDashboardSummary } from '../services/analytics';
import { useAsync } from './useAsync';

export interface DashboardSummary {
  inventory: {
    totalProducts: number;
    totalStockValue: number;
    totalExpectedProfit: number;
    outOfStockItems: number;
    expiredItems: number;
    expiringSoonItems: number;
    expiryWarningDays: number;
  };
  sales: {
    currentMonthTotal: number;
    currentMonthCount: number;
  };
}

const fetchSummary = () => getDashboardSummary().then(res => res.data as DashboardSummary);

export function useDashboardSummary() {
  const { data: summary, loading, refetch } = useAsync<DashboardSummary | null>(fetchSummary, {
    initial: null,
    errorMessage: 'Erro ao carregar os indicadores:',
  });

  return { summary, loading, refetch };
}
