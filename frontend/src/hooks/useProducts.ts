import { useState, useEffect, useCallback } from 'react';
import { listProducts } from '../services/catalog';

export interface Brand {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
}

/**
 * Produto como o estoque do admin recebe: a linha do banco, mais a marca e a
 * categoria resolvidas e os números que o servidor calcula na leitura.
 */
export interface Product {
  id: number;
  name: string;
  imageUrl: string | null;
  quantity: number;
  averageCost: number;
  sellingPrice: number;
  promotionalPrice: number | null;
  expiryDate: string | null;
  createdAt: string;

  brandId: number;
  brand: Brand;
  categoryId: number | null;
  category: Category | null;

  /** Somatório das reservas ativas da vitrine sobre este produto. */
  reserved: number;
  /** `quantity` menos as reservas — nunca negativo. */
  available: number;

  /** O promocional quando existe, senão o de venda. */
  activePrice: number;
  unitProfit: number;
  totalExpectedProfit: number;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listProducts();
      setProducts(res.data || []);
    } catch (err) {
      console.error("Erro ao buscar produtos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, refetch: fetchProducts };
}
