import { prisma } from './prisma.js';

/**
 * Disponibilidade de estoque.
 *
 * A regra é uma só: **estoque disponível nunca é armazenado, sempre é
 * derivado**. Disponível é `Product.quantity` menos a soma das reservas ativas,
 * calculada no momento da leitura.
 *
 * Não existe processo em segundo plano liberando reserva vencida. Um job seria
 * uma segunda fonte de verdade — pode atrasar, cair ou rodar duas vezes; a
 * consulta simplesmente ignora quem já venceu, e a unidade volta a aparecer no
 * mesmo instante em que a reserva expira.
 *
 * O custo é que toda leitura de estoque vira uma agregação. Com a ordem de
 * grandeza de produtos deste catálogo isso é irrelevante. Se um dia pesar, o
 * caminho é materializar um `reservedQuantity` atualizado na mesma transação —
 * mas só depois de medir.
 */

/** Reserva do visitante sem conta. Tempo de encher o carrinho e entrar. */
export const ANONYMOUS_RESERVATION_MINUTES = 5;

/** Depois que a identidade entra, a pressa deixa de fazer sentido. */
export const IDENTIFIED_RESERVATION_MINUTES = 30;

/** Teto por carrinho: sem isso um script reserva o catálogo inteiro. */
export const MAX_UNITS_PER_CART = 50;
export const MAX_LINES_PER_CART = 30;

export type Prisma$Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export function reservationExpiry(minutes: number, from: Date = new Date()) {
  return new Date(from.getTime() + minutes * 60 * 1000);
}

/**
 * Soma das reservas ativas por produto.
 *
 * Ativa é `expiresAt > now()` e `orderId IS NULL`. Reserva presa a um pedido
 * sai da conta de propósito: um pedido pendente não segura estoque — é a
 * decisão D2, o balcão ganha. É justamente por isso que a confirmação do
 * pedido revalida o estoque e pode recusar.
 */
export async function getReservedByProduct(
  productIds: number[],
  options: { excludeCartToken?: string; tx?: Prisma$Tx } = {}
): Promise<Map<number, number>> {
  const reserved = new Map<number, number>();

  if (productIds.length === 0) return reserved;

  const client = options.tx ?? prisma;

  const rows = await client.reservation.groupBy({
    by: ['productId'],
    where: {
      productId: { in: productIds },
      expiresAt: { gt: new Date() },
      orderId: null,
      // A própria reserva do visitante não pode aparecer para ele como estoque
      // de outra pessoa — senão o carrinho dele bloqueia o carrinho dele.
      ...(options.excludeCartToken ? { cartToken: { not: options.excludeCartToken } } : {}),
    },
    _sum: { quantity: true },
  });

  for (const row of rows) {
    reserved.set(row.productId, row._sum.quantity ?? 0);
  }

  return reserved;
}

export type StockView = {
  productId: number;
  quantity: number;
  reserved: number;
  available: number;
};

/** Junta quantidade física e reservas num só objeto por produto. */
export async function getStockView(
  products: Array<{ id: number; quantity: number }>,
  options: { excludeCartToken?: string; tx?: Prisma$Tx } = {}
): Promise<Map<number, StockView>> {
  const reservedByProduct = await getReservedByProduct(products.map(p => p.id), options);

  const view = new Map<number, StockView>();

  for (const product of products) {
    const reserved = reservedByProduct.get(product.id) ?? 0;

    view.set(product.id, {
      productId: product.id,
      quantity: product.quantity,
      reserved,
      // Estoque negativo não existe: o balcão pode ter vendido o que estava
      // reservado, e aí a soma das reservas passa do que há em prateleira.
      available: Math.max(product.quantity - reserved, 0),
    });
  }

  return view;
}

/** Acrescenta `reserved` e `available` a uma lista de produtos já carregada. */
export async function withAvailability<T extends { id: number; quantity: number }>(
  products: T[],
  options: { excludeCartToken?: string } = {}
): Promise<Array<T & { reserved: number; available: number }>> {
  const view = await getStockView(products, options);

  return products.map(product => {
    const stock = view.get(product.id);
    return {
      ...product,
      reserved: stock?.reserved ?? 0,
      available: stock?.available ?? product.quantity,
    };
  });
}
