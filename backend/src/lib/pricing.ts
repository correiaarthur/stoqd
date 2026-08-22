type PricedProduct = {
  sellingPrice: number;
  promotionalPrice: number | null;
};

// Preço que o cliente realmente paga. Usado na vitrine, no estoque e na venda —
// se cada lugar calcular por conta própria, o caixa cobra um valor e a tela mostra outro.
export function getActivePrice(product: PricedProduct) {
  return product.promotionalPrice ? product.promotionalPrice : product.sellingPrice;
}
