import { useEffect, useMemo, useRef, useState } from 'react';

import { useCart } from '../contexts/cart';

/**
 * O que o estoque de agora diz da sacola: quanto cada item ainda vende, quais
 * itens não cabem mais e como ajustar todos de uma vez.
 *
 * Ao montar, pede ao servidor a disponibilidade de agora: é o caso do carrinho
 * que sobreviveu no navegador enquanto a reserva vencia. Os itens já estão na
 * tela (vêm do navegador); o que ainda não se sabe é o estoque de cada um.
 * Enquanto essa resposta não chega, `checkingStock` é `true` e só o lugar dela
 * vira esqueleto — esconder a sacola inteira seria esconder o que já se sabe.
 */
export function useBagStock(admin: boolean) {
  const { items, availability, setQuantity, refreshAvailability } = useCart();

  const checkedOnMount = useRef(false);
  const [checkingStock, setCheckingStock] = useState(items.length > 0);
  useEffect(() => {
    if (checkedOnMount.current) return;
    checkedOnMount.current = true;
    Promise.resolve(refreshAvailability()).finally(() => setCheckingStock(false));
  }, [refreshAvailability]);

  // O que barra o admin não é o que barra o visitante. Quem está com o produto
  // na mão vende (decisão D2): para o balcão só o estoque físico impede, e a
  // reserva de alguém do site vira aviso, não bloqueio.
  const sellableFor = useMemo(() => (productId: number) => {
    const status = availability[productId];
    if (!status) return null;

    return admin ? status.quantity : status.available;
  }, [availability, admin]);

  const blockingItems = useMemo(() => items.filter(item => {
    const left = sellableFor(item.productId);
    return left !== null && left < item.quantity;
  }), [items, sellableFor]);

  /** Resolve todos de uma vez: ajusta o que sobrou, remove o que esgotou. */
  const fixAllBlocking = () => {
    for (const item of blockingItems) {
      setQuantity(item.productId, sellableFor(item.productId) ?? 0);
    }
  };

  return { checkingStock, sellableFor, blockingItems, fixAllBlocking };
}
