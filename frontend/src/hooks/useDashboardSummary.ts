import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

export function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/analytics/summary');
      setSummary(res.data);
    } catch (err) {
      console.error("Erro ao carregar os indicadores:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}
