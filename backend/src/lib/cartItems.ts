/** Leitura e validação da lista de itens que chega do carrinho. */

export type ParsedItem = { productId: number; quantity: number };

export type ParseResult =
  | { ok: true; items: ParsedItem[] }
  | { ok: false; error: string };

/**
 * Quantidade negativa passaria na checagem de estoque, aumentaria o estoque no
 * decremento e reduziria o total — por isso a validação é estrita e o mesmo
 * produto não pode aparecer duas vezes.
 */
export function parseCartItems(
  raw: unknown,
  limits: { maxLines: number; maxUnits: number }
): ParseResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "O carrinho está vazio." };
  }

  if (raw.length > limits.maxLines) {
    return { ok: false, error: `O carrinho aceita no máximo ${limits.maxLines} produtos diferentes.` };
  }

  const items: ParsedItem[] = [];
  const seen = new Set<number>();
  let totalUnits = 0;

  for (const entry of raw) {
    const productId = Number((entry as any)?.productId);
    const quantity = Number((entry as any)?.quantity);

    if (!Number.isInteger(productId) || productId < 1) {
      return { ok: false, error: "Item inválido no carrinho." };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: "A quantidade de cada item precisa ser um número inteiro maior que zero." };
    }
    if (seen.has(productId)) {
      return { ok: false, error: "O mesmo produto aparece mais de uma vez no carrinho." };
    }

    seen.add(productId);
    totalUnits += quantity;
    items.push({ productId, quantity });
  }

  if (totalUnits > limits.maxUnits) {
    return { ok: false, error: `O carrinho aceita no máximo ${limits.maxUnits} unidades no total.` };
  }

  return { ok: true, items };
}

/** O carrinho anônimo se identifica por um token gerado no navegador. */
export function parseCartToken(raw: unknown): string | null {
  const token = String(raw ?? '').trim();

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

  return token;
}
