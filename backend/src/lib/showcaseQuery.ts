import type { Prisma } from '@prisma/client';

/**
 * A vitrine pagina: 24 produtos por vez, e o próximo lote só quando a rolagem
 * chega perto do fim. Paginar obriga o filtro a morar aqui — filtrar no
 * navegador só enxergaria a página que já chegou.
 */
export const SHOWCASE_PAGE_DEFAULT = 24;
export const SHOWCASE_PAGE_MAX = 60;

/**
 * A vitrine anda em duas fases: primeiro o que tem estoque, depois o
 * esgotado — esgotado no meio da prateleira é ruído para quem está
 * escolhendo. O cursor diz em que fase a rolagem está e o último produto
 * entregue nela: `i:42` (com estoque, depois do 42), `o:17` (esgotados,
 * depois do 17) ou `o:` (esgotados, do começo).
 */
export type ShowcasePhase = 'in' | 'out';
export type ShowcaseCursor = { phase: ShowcasePhase; id: number | null };

export function encodeShowcaseCursor(phase: ShowcasePhase, id: number | null): string {
  return `${phase === 'in' ? 'i' : 'o'}:${id ?? ''}`;
}

export function parseShowcaseCursor(value: unknown): ShowcaseCursor | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // Cursor numérico é o formato de antes das fases: continua valendo como
  // "com estoque", para uma aba aberta antes da mudança não quebrar.
  const legacy = asPositiveInt(raw);
  if (legacy) return { phase: 'in', id: legacy };

  const match = /^([io]):(\d*)$/.exec(raw);
  if (!match) return null;
  const id = match[2] ? asPositiveInt(match[2]) : null;
  if (match[2] && !id) return null;
  return { phase: match[1] === 'i' ? 'in' : 'out', id };
}

export type ShowcaseFilters = {
  limit: number;
  /** Onde a próxima página começa; `null` é o começo da vitrine. */
  cursor: ShowcaseCursor | null;
  q: string;
  brands: string[];
  categories: string[];
  promo: boolean;
};

/** `?brand=A&brand=B` chega como array; `?brand=A`, como string. */
function asList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return raw
    .map(v => String(v).trim())
    .filter(v => v.length > 0 && v.length <= 100)
    .slice(0, 30);
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Lê a query sem confiar nela: valor estranho vira o padrão, nunca um 500. */
export function parseShowcaseQuery(query: Record<string, unknown>): ShowcaseFilters {
  const limit = asPositiveInt(query.limit) ?? SHOWCASE_PAGE_DEFAULT;

  return {
    limit: Math.min(limit, SHOWCASE_PAGE_MAX),
    cursor: parseShowcaseCursor(query.cursor),
    q: String(query.q ?? '').trim().slice(0, 100),
    brands: asList(query.brand),
    categories: asList(query.category),
    promo: query.promo === '1' || query.promo === 'true',
  };
}

/**
 * Promoção é o que `getActivePrice` trata como promoção: preço promocional
 * presente e diferente de zero. Os dois lados precisam concordar, senão o
 * filtro mostra um produto que a etiqueta cobra cheio.
 */
export const PROMO_WHERE: Prisma.ProductWhereInput = {
  promotionalPrice: { not: null, gt: 0 },
};

export function buildShowcaseWhere(filters: ShowcaseFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (filters.brands.length > 0) and.push({ brand: { name: { in: filters.brands } } });
  if (filters.categories.length > 0) and.push({ category: { name: { in: filters.categories } } });
  if (filters.promo) and.push(PROMO_WHERE);

  if (filters.q) {
    const contains = { contains: filters.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { name: contains },
        { brand: { name: contains } },
        { category: { name: contains } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}
