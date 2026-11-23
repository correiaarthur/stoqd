import { createContext, useContext } from 'react';

export type CartItem = {
  productId: number;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
};

export type ItemAvailability = {
  /** Descontadas as reservas de outras pessoas — o que o visitante pode levar. */
  available: number;
  /** O que existe na prateleira. É este que o balcão respeita (decisão D2). */
  quantity: number;
  reserved: number;
  status: 'ok' | 'partial' | 'unavailable' | 'gone';
};

export type CartProduct = {
  id: number;
  name: string;
  imageUrl?: string | null;
  activePrice?: number;
  sellingPrice?: number;
};

export type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  total: number;
  /** Quando a reserva atual vence. `null` quando não há reserva ativa. */
  expiresAt: string | null;
  /**
   * Duração total da reserva em minutos (5 anônimo, 30 identificado). A barra
   * de progresso precisa do total, não só do que falta — sem ele não dá para
   * saber quanto do prazo já passou.
   */
  reservationMinutes: number | null;
  availability: Record<number, ItemAvailability>;
  addItem: (product: CartProduct, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
  /** Confere o estoque de agora sem reservar. Usado ao abrir o checkout. */
  refreshAvailability: () => Promise<void>;
  cartToken: string;
};

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const context = useContext(CartContext);

  if (!context) throw new Error('useCart precisa estar dentro de <CartProvider>.');

  return context;
}
