/** Leitura e validação da lista de itens que chega do carrinho. */

import { z } from 'zod';

import { bodyOf, positiveInt } from './validate.js';

export type ParsedItem = { productId: number; quantity: number };

export type ParseResult =
  | { ok: true; items: ParsedItem[] }
  | { ok: false; error: string };

type Limits = { maxLines: number; maxUnits: number; /** O carrinho vazio, dito para a tela de quem chamou ('A venda precisa ter...'). */ emptyMessage?: string };

const MSG_VAZIO = "O carrinho está vazio.";
const MSG_ITEM = "Item inválido no carrinho.";
const MSG_QUANTIDADE = "A quantidade de cada item precisa ser um número inteiro maior que zero.";

const itemSchema = bodyOf({
  productId: positiveInt(MSG_ITEM),
  quantity: positiveInt(MSG_QUANTIDADE),
});

/**
 * A lista de itens do carrinho, com os tetos de linhas e de unidades.
 *
 * Quantidade negativa passaria na checagem de estoque, aumentaria o estoque no
 * decremento e reduziria o total — por isso a validação é estrita e o mesmo
 * produto não pode aparecer duas vezes. Cada item é validado antes de os tetos
 * e a repetição serem conferidos: um item inválido é o erro que a pessoa vê, não
 * o limite de unidades somadas.
 */
export const cartItemsSchema = ({ maxLines, maxUnits, emptyMessage = MSG_VAZIO }: Limits) => z
  .array(itemSchema, { error: emptyMessage })
  .min(1, { error: emptyMessage })
  .max(maxLines, { error: `O carrinho aceita no máximo ${maxLines} produtos diferentes.` })
  .superRefine((items, ctx) => {
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      ctx.addIssue({ code: 'custom', message: "O mesmo produto aparece mais de uma vez no carrinho." });
      return;
    }

    if (items.reduce((total, item) => total + item.quantity, 0) > maxUnits) {
      ctx.addIssue({ code: 'custom', message: `O carrinho aceita no máximo ${maxUnits} unidades no total.` });
    }
  });

export function parseCartItems(raw: unknown, limits: Limits): ParseResult {
  const result = cartItemsSchema(limits).safeParse(raw);

  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? MSG_VAZIO };

  return { ok: true, items: result.data };
}

/** O carrinho anônimo se identifica por um token gerado no navegador. */
export function parseCartToken(raw: unknown): string | null {
  const token = String(raw ?? '').trim();

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

  return token;
}
