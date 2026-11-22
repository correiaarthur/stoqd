import { useState, useEffect, useCallback } from 'react';
import { listSales } from '../services/orders';

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
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fromISO = from.toISOString();

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listSales({ from: fromISO, limit: 200 });
      setSales(res.data || []);
    } catch (err) {
      console.error("Erro ao buscar vendas:", err);
    } finally {
      setLoading(false);
    }
  }, [fromISO]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  return { sales, loading, refetch: fetchSales };
}
