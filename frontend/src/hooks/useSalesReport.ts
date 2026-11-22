import { useState, useEffect, useCallback } from 'react';
import { getSalesReport } from '../services/analytics';

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
// puxaria o histórico inteiro a cada troca de filtro.
export function useSalesReport(from: Date) {
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fromISO = from.toISOString();

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSalesReport(fromISO);
      setSoldItems(res.data || []);
    } catch (err) {
      console.error("Erro ao carregar o relatório de vendas:", err);
    } finally {
      setLoading(false);
    }
  }, [fromISO]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { soldItems, loading, refetch: fetchReport };
}
