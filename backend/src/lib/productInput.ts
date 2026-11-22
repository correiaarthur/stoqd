/**
 * Leitura e validação do produto que chega do cadastro.
 *
 * Existe porque o controller confiava no corpo da requisição inteiro: os campos
 * iam de `req.body` direto para o Prisma com um `Number()` em volta. Três
 * consequências medidas:
 *
 *  - `quantity: -5` era aceito com HTTP 201 e gravava estoque negativo;
 *  - `name` ausente virava `where: { name: undefined }` e estourava um erro cru
 *    do Prisma como 500, em vez de 400 dizendo o que faltou;
 *  - custo zero entrava na média ponderada e derrubava o custo médio.
 *
 * Agora é um schema (`productSchema`): devolve `ok` com o dado já convertido ou
 * `ok:false` com a mensagem que o operador lê na tela.
 */

import { z } from 'zod';

import { isAllowedImageUrl } from './storage.js';
import { bodyOf, isBlank, money, optional, parseWith, positiveInt, trimmed, type ParseResult } from './validate.js';

const MAX_NOME = 200;

/** Teto de sanidade: acima disso é erro de digitação, não estoque. */
const MAX_QUANTIDADE = 1_000_000;
const MAX_VALOR = 10_000_000;

const MSG_QUANTIDADE = "A quantidade precisa ser um número inteiro de zero para cima.";

/**
 * Valida a data e guarda só o **dia**.
 *
 * Validade não tem hora: o que vale é o dia impresso na embalagem. Normalizar
 * para meia-noite UTC aqui é o que permite comparar validade com "hoje" sem o
 * fuso deslocar um dia — o erro que fazia o produto que vence hoje aparecer como
 * vencido.
 *
 * Dia que não existe (30 de fevereiro, mês 13) é recusado: `Date.UTC` o empurraria
 * em silêncio para o mês seguinte e o produto ganharia uma validade que ninguém
 * digitou.
 */
function diaDeValidade(texto: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!match) return null;

  const [ano, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  const existe = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return existe ? data : null;
}

const MSG_VALIDADE = "A data de validade não é válida.";

/**
 * O produto que chega do cadastro. A ordem das chaves é a ordem em que o erro é
 * reportado: nome, marca, categoria, quantidade, valores, validade, imagem.
 */
export const productSchema = bodyOf({
  name: trimmed.pipe(
    z.string()
      .min(1, { error: "O nome do produto é obrigatório." })
      .max(MAX_NOME, { error: `O nome do produto passa de ${MAX_NOME} caracteres.` })
  ),

  brandId: positiveInt("Escolha a marca do produto."),

  categoryId: optional(positiveInt("Categoria inválida.")),

  // O caso que deixava estoque negativo entrar pela API. Ausente vale zero.
  quantity: z.preprocess(
    value => value ?? 0,
    z.coerce.number({ error: MSG_QUANTIDADE })
      .int({ error: MSG_QUANTIDADE })
      .min(0, { error: MSG_QUANTIDADE })
      .max(MAX_QUANTIDADE, { error: "A quantidade informada é alta demais. Confira o número." })
  ),

  averageCost: z.preprocess(value => value ?? 0, money("O custo precisa ser um valor de zero para cima.", MAX_VALOR)),

  sellingPrice: z.preprocess(value => value ?? 0, money("O preço de venda precisa ser um valor de zero para cima.", MAX_VALOR)),

  promotionalPrice: optional(money("O preço promocional precisa ser um valor de zero para cima.", MAX_VALOR)),

  expiryDate: z.preprocess(
    value => (isBlank(value) ? null : String(value)),
    z.string({ error: MSG_VALIDADE })
      .transform(diaDeValidade)
      .refine(data => data !== null, { error: MSG_VALIDADE })
      .nullable()
  ),

  imageUrl: z.preprocess(
    value => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
    z.string()
      .refine(isAllowedImageUrl, { error: "A imagem precisa ser enviada pelo próprio sistema." })
      .nullable()
  ),
});

export type ProductInput = z.output<typeof productSchema>;

export type ProductParseResult = ParseResult<ProductInput>;

export function parseProductInput(raw: unknown): ProductParseResult {
  return parseWith(productSchema, raw);
}

/**
 * Custo médio ponderado ao reabastecer.
 *
 * **Custo zero não entra na média.** Um reabastecimento sem custo informado é
 * lacuna de cadastro, não mercadoria de graça: incluí-lo rebaixaria o custo
 * médio e inflaria o lucro no Dashboard. Medido antes da correção: um produto
 * com custo 50 caía para 25 ao receber 10 unidades sem custo.
 *
 * Esse raciocínio já estava escrito no projeto — no script de consolidação de
 * produtos duplicados — e não tinha chegado ao cadastro.
 */
export function mergeAverageCost(
  atual: { quantity: number; averageCost: number },
  entrada: { quantity: number; averageCost: number }
): number {
  if (entrada.averageCost <= 0) return atual.averageCost;
  if (atual.quantity <= 0 || atual.averageCost <= 0) return entrada.averageCost;

  const total = atual.quantity + entrada.quantity;
  if (total <= 0) return entrada.averageCost;

  return (atual.quantity * atual.averageCost + entrada.quantity * entrada.averageCost) / total;
}

/**
 * A data que o produto guarda quando recebe lote novo: a que vence primeiro.
 *
 * Um produto guarda uma única validade, mas o estoque junta unidades de compras
 * diferentes. Manter a mais próxima sinaliza o lote mais velho em vez de
 * esconder atrás da entrada mais recente. (Controle por lote exigiria uma
 * tabela de lotes — ver README.)
 */
export function mergeExpiryDates(atual: Date | null, entrada: Date | null): Date | null {
  if (!entrada) return atual;
  if (!atual) return entrada;

  return entrada < atual ? entrada : atual;
}
