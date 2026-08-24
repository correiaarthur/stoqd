import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { getCartToken } from '../utils/cartToken';
import { isAdmin } from '../utils/auth';
import { CartContext, type CartContextValue, type CartItem, type ItemAvailability } from './cart';

const CART_STORAGE_KEY = 'cart';

/** Tempo entre a última mexida no carrinho e a chamada de reserva. */
const RESERVE_DEBOUNCE_MS = 700;

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(item =>
      typeof item?.productId === 'number' && typeof item?.quantity === 'number' && item.quantity > 0
    );
  } catch {
    return [];
  }
}

/**
 * O carrinho vive no navegador e não depende da reserva.
 *
 * Se o visitante ignorou os 5 minutos e voltou meia hora depois, os itens
 * continuam aqui — a reserva não. É por isso que o checkout pergunta a
 * disponibilidade ao servidor antes de deixar finalizar, em vez de confiar no
 * que está guardado.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  const [reservation, setReservation] = useState<{
    expiresAt: string | null;
    minutes: number | null;
    availability: Record<number, ItemAvailability>;
  }>({ expiresAt: null, minutes: null, availability: {} });

  const cartToken = useMemo(() => getCartToken(), []);
  const reserveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const applyServerAnswer = useCallback((data: {
    expiresAt?: string | null;
    minutes?: number;
    items?: Array<{ productId: number; available: number; quantity?: number; reserved?: number; status: string }>;
  }) => {
    const availability: Record<number, ItemAvailability> = {};

    for (const item of data.items ?? []) {
      availability[item.productId] = {
        available: item.available,
        // A resposta de reserva não traz o físico; ali o disponível é o que
        // importa, porque quem reserva é o visitante.
        quantity: item.quantity ?? item.available,
        reserved: item.reserved ?? 0,
        status: item.status as ItemAvailability['status'],
      };
    }

    // `minutes` só vem na resposta de reserva; a de disponibilidade mantém o
    // que já se sabia, senão a barra perderia a escala ao reconferir estoque.
    setReservation(prev => ({
      expiresAt: data.expiresAt ?? null,
      minutes: data.minutes ?? prev.minutes,
      availability,
    }));
  }, []);

  const buildPayload = useCallback(() => ({
    cartToken,
    items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
  }), [cartToken, items]);

  const refreshAvailability = useCallback(async () => {
    if (items.length === 0) return;

    try {
      const res = await api.post('/cart/availability', buildPayload());
      applyServerAnswer(res.data);
    } catch (err) {
      // Falha aqui não pode travar a tela: o servidor confere de novo na hora
      // de enviar o pedido, que é onde a decisão realmente vale.
      console.error('Erro ao conferir disponibilidade:', err);
    }
  }, [items.length, buildPayload, applyServerAnswer]);

  // Toda mexida no carrinho reserva de novo, com uma pausa para não disparar
  // uma chamada por clique no "+". Reservar é substituir a lista inteira, então
  // repetir a chamada não deixa reserva órfã para trás.
  useEffect(() => {
    if (items.length === 0) {
      // Sem itens não há o que reservar — e o que já estava reservado sai.
      api.post('/cart/release', { cartToken }).catch(() => {});
      return;
    }

    // O admin vende no balcão pelo mesmo checkout. Reservar contra si mesmo só
    // tiraria da vitrine um estoque que ele já está com a mão.
    if (isAdmin()) return;

    reserveTimer.current = setTimeout(async () => {
      try {
        const res = await api.post('/cart/reserve', buildPayload());
        applyServerAnswer(res.data);
      } catch (err) {
        console.error('Erro ao reservar o carrinho:', err);
      }
    }, RESERVE_DEBOUNCE_MS);

    return () => {
      if (reserveTimer.current) clearTimeout(reserveTimer.current);
    };
  }, [items, cartToken, buildPayload, applyServerAnswer]);

  const addItem: CartContextValue['addItem'] = useCallback((product, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(item => item.productId === product.id);

      if (existing) {
        return prev.map(item =>
          item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }

      return [...prev, {
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl ?? null,
        unitPrice: Number(product.activePrice ?? product.sellingPrice ?? 0),
        quantity,
      }];
    });
  }, []);

  const setQuantity: CartContextValue['setQuantity'] = useCallback((productId, quantity) => {
    setItems(prev => quantity < 1
      ? prev.filter(item => item.productId !== productId)
      : prev.map(item => (item.productId === productId ? { ...item, quantity } : item))
    );
  }, []);

  const removeItem: CartContextValue['removeItem'] = useCallback((productId) => {
    setItems(prev => prev.filter(item => item.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount: items.reduce((acc, item) => acc + item.quantity, 0),
    total: items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    // Carrinho vazio não tem reserva nem disponibilidade a mostrar. Derivar
    // aqui evita ter que zerar o estado por dentro do efeito.
    expiresAt: items.length > 0 ? reservation.expiresAt : null,
    reservationMinutes: items.length > 0 ? reservation.minutes : null,
    availability: items.length > 0 ? reservation.availability : {},
    addItem,
    setQuantity,
    removeItem,
    clear,
    refreshAvailability,
    cartToken,
  }), [items, reservation, addItem, setQuantity, removeItem, clear, refreshAvailability, cartToken]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
