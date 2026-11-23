import { listProducts } from '../services/catalog';
import { useAsync } from './useAsync';

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

const fetchProducts = () => listProducts().then(res => res.data || []);

export function useProducts() {
  const { data: products, loading, refetch } = useAsync<Product[]>(fetchProducts, {
    initial: [],
    errorMessage: 'Erro ao buscar produtos:',
  });

  return { products, loading, refetch };
}
