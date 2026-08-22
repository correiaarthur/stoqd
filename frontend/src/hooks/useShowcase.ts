import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useShowcase() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShowcase = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/products/showcase');
      setProducts(res.data || []);
    } catch (err) {
      console.error("Erro ao buscar a vitrine:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShowcase();
  }, [fetchShowcase]);

  return { products, loading, refetch: fetchShowcase };
}
