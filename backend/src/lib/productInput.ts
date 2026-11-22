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
 * Mesmo formato de `parseCartItems`: devolve `ok` com o dado limpo ou `ok:false`
 * com a mensagem que o operador lê na tela.
 */

import { isAllowedImageUrl } from './storage.js';

export type ProductInput = {
  name: string;
  brandId: number;
  categoryId: number | null;
  quantity: number;
  averageCost: number;
  sellingPrice: number;
  promotionalPrice: number | null;
  expiryDate: Date | null;
  imageUrl: string | null;
};

export type ProductParseResult =
  | { ok: true; data: ProductInput }
  | { ok: false; error: string };

const MAX_NOME = 200;

/** Teto de sanidade: acima disso é erro de digitação, não estoque. */
const MAX_QUANTIDADE = 1_000_000;
const MAX_VALOR = 10_000_000;

function inteiroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function valorMonetario(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n <= MAX_VALOR ? n : null;
}

/**
 * Valida a data e guarda só o **dia**.
 *
 * Validade não tem hora: o que vale é o dia impresso na embalagem. Normalizar
 * para meia-noite UTC aqui é o que permite comparar validade com "hoje" sem o
 * fuso deslocar um dia — o erro que fazia o produto que vence hoje aparecer como
 * vencido.
 */
function diaDeValidade(valor: unknown): { ok: true; data: Date | null } | { ok: false } {
  if (valor === null || valor === undefined || valor === '') return { ok: true, data: null };

  const texto = String(valor);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);

  if (!match) return { ok: false };

  const [, ano, mes, dia] = match;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));

  return Number.isNaN(data.getTime()) ? { ok: false } : { ok: true, data };
}

export function parseProductInput(raw: unknown): ProductParseResult {
  const body = (raw ?? {}) as Record<string, unknown>;

  const name = String(body['name'] ?? '').trim();
  if (name.length === 0) return { ok: false, error: "O nome do produto é obrigatório." };
  if (name.length > MAX_NOME) {
    return { ok: false, error: `O nome do produto passa de ${MAX_NOME} caracteres.` };
  }

  const brandId = inteiroPositivo(body['brandId']);
  if (brandId === null) return { ok: false, error: "Escolha a marca do produto." };

  let categoryId: number | null = null;
  if (body['categoryId'] !== null && body['categoryId'] !== undefined && body['categoryId'] !== '') {
    categoryId = inteiroPositivo(body['categoryId']);
    if (categoryId === null) return { ok: false, error: "Categoria inválida." };
  }

  const quantity = Number(body['quantity'] ?? 0);
  if (!Number.isInteger(quantity) || quantity < 0) {
    // O caso que deixava estoque negativo entrar pela API.
    return { ok: false, error: "A quantidade precisa ser um número inteiro de zero para cima." };
  }
  if (quantity > MAX_QUANTIDADE) {
    return { ok: false, error: "A quantidade informada é alta demais. Confira o número." };
  }

  const averageCost = valorMonetario(body['averageCost'] ?? 0);
  if (averageCost === null) return { ok: false, error: "O custo precisa ser um valor de zero para cima." };

  const sellingPrice = valorMonetario(body['sellingPrice'] ?? 0);
  if (sellingPrice === null) return { ok: false, error: "O preço de venda precisa ser um valor de zero para cima." };

  let promotionalPrice: number | null = null;
  if (body['promotionalPrice'] !== null && body['promotionalPrice'] !== undefined && body['promotionalPrice'] !== '') {
    promotionalPrice = valorMonetario(body['promotionalPrice']);
    if (promotionalPrice === null) {
      return { ok: false, error: "O preço promocional precisa ser um valor de zero para cima." };
    }
  }

  const validade = diaDeValidade(body['expiryDate']);
  if (!validade.ok) return { ok: false, error: "A data de validade não é válida." };

  const imagem = body['imageUrl'];
  const imageUrl = typeof imagem === 'string' && imagem.trim() !== '' ? imagem.trim() : null;

  if (imageUrl !== null && !isAllowedImageUrl(imageUrl)) {
    return { ok: false, error: "A imagem precisa ser enviada pelo próprio sistema." };
  }

  return {
    ok: true,
    data: { name, brandId, categoryId, quantity, averageCost, sellingPrice, promotionalPrice, expiryDate: validade.data, imageUrl },
  };
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
