import { listOrders } from '../services/orders';
import { useAsync } from './useAsync';

export type OrderItemView = {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  currentPrice: number;
  priceChanged: boolean;
  quantityInStock: number;
  available: number;
  hasStock: boolean;
};

export type PendingOrder = {
  id: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  observation: string | null;
  user: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    customer: { id: number; name: string } | null;
  };
  suggestedCustomers: Array<{ id: number; name: string; phone: string | null; email: string | null }>;
  items: OrderItemView[];
  total: number;
  hasStockForAll: boolean;
  /** O que o cliente pediu, com as contas prontas. É preferência, não decisão. */
  requested: {
    paymentType: 'VISTA' | 'PRAZO';
    installmentsCount: number;
    /** Null quando a loja desligou aquele parcelamento depois do pedido. */
    interestPercent: number | null;
    coupon: { id: number; code: string; discount: number } | null;
    subtotal: number;
    discount: number;
    interest: number;
    total: number;
    installmentValue: number;
  };
};

const fetchPending = () => listOrders('PENDING').then(res => res.data || []);

export function usePendingOrders() {
  const { data: orders, loading, refetch } = useAsync<PendingOrder[]>(fetchPending, {
    initial: [],
    errorMessage: 'Erro ao buscar pedidos:',
  });

  return { orders, loading, refetch };
}
