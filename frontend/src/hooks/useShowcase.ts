import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { getCartToken } from '../utils/cartToken';

export function useShowcase() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShowcase = useCallback(async () => {
    try {
      setLoading(true);
      // O cartToken vai junto para a vitrine não descontar do disponível a
      // reserva do próprio visitante — senão o carrinho dele esconderia dele
      // mesmo o produto que ele acabou de escolher.
      const res = await api.get('/products/showcase', { params: { cartToken: getCartToken() } });
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
