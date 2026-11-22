import { useCallback } from 'react';
import { listSales } from '../services/orders';
import { useAsync } from './useAsync';

export interface SaleListItem {
  id: number;
  date: string;
  total: number;
  discount: number | null;
  observation: string | null;
  grossTotal: number;
  itemsCount: number;
  isPaid: boolean;
  pendingAmount: number;
  customer: { id: number; name: string } | null;
  items: Array<{
    id: number;
    quantity: number;
    unitPrice: number;
    product: { name: string };
  }>;
  installments: Array<{
    id: number;
    number: number;
    value: number;
    dueDate: string;
    paidAt: string | null;
  }>;
}

export function useSalesList(from: Date) {
  const fromISO = from.toISOString();

  const fetchSales = useCallback(
    () => listSales({ from: fromISO, limit: 200 }).then(res => res.data || []),
    [fromISO]
  );

  const { data: sales, loading, refetch } = useAsync<SaleListItem[]>(fetchSales, {
    initial: [],
    errorMessage: 'Erro ao buscar vendas:',
  });

  return { sales, loading, refetch };
}
