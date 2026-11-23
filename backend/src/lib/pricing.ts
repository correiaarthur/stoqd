type PricedProduct = {
  sellingPrice: number;
  promotionalPrice: number | null;
};

// Preço que o cliente realmente paga. Usado na vitrine, no estoque e na venda —
// se cada lugar calcular por conta própria, o caixa cobra um valor e a tela mostra outro.
export function getActivePrice(product: PricedProduct) {
  return product.promotionalPrice ? product.promotionalPrice : product.sellingPrice;
}

/**
 * As colunas que `getActivePrice` precisa — e nada além.
 *
 * Esquecer `promotionalPrice` numa consulta não quebra o build: só faz aquele
 * caminho cobrar o preço cheio de um produto em promoção. Por isso o par anda
 * junto, num lugar só.
 */
export const PRODUCT_PRICING_SELECT = {
  id: true,
  sellingPrice: true,
  promotionalPrice: true,
} as const;

/**
 * O preço mais o que as mensagens de estoque precisam dizer.
 *
 * Carrinho, pedido e confirmação respondem coisas como "restam 2 de 3 unidades
 * de Café": precisam do nome e da quantidade física junto do preço. A vitrine
 * precisa de mais (imagem, marca, categoria) e monta o seu próprio.
 */
export const PRODUCT_STOCK_SELECT = {
  ...PRODUCT_PRICING_SELECT,
  name: true,
  quantity: true,
} as const;
