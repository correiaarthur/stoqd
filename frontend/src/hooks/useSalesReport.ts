import { useCallback } from 'react';
import { getSalesReport } from '../services/analytics';
import { useAsync } from './useAsync';

export interface SoldItem {
  saleId: number;
  date: string;
  quantity: number;
  revenue: number;
  productName: string;
  brandName: string;
  categoryName: string;
}

// `from` limita o relatório ao período analisado — sem ele o dashboard
// puxaria o histórico inteiro a cada troca de filtro (e o servidor recusa).
export function useSalesReport(from: Date) {
  const fromISO = from.toISOString();

  const fetchReport = useCallback(
    () => getSalesReport(fromISO).then(res => res.data || []),
    [fromISO]
  );

  const { data: soldItems, loading, refetch } = useAsync<SoldItem[]>(fetchReport, {
    initial: [],
    errorMessage: 'Erro ao carregar o relatório de vendas:',
  });

  return { soldItems, loading, refetch };
}
