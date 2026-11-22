import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getCartToken } from '../utils/cartToken';

/**
 * Produto como a vitrine recebe. É deliberadamente mais magro que o do estoque:
 * custo médio e lucro não saem para quem está comprando.
 */
export interface ShowcaseProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  quantity: number;
  sellingPrice: number;
  promotionalPrice: number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  reserved: number;
  available: number;
  activePrice: number;
}

export type ShowcaseFilters = {
  q: string;
  brands: string[];
  categories: string[];
  promo: boolean;
};

export type ShowcaseFacets = {
  total: number;
  promo: number;
  brands: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  featured: ShowcaseProduct | null;
  /** Até três destaques da edição, o primeiro igual a `featured`. */
  highlights: ShowcaseProduct[];
};

/** O cursor é opaco: o servidor diz onde a próxima página começa. */
type ShowcasePage = { items: ShowcaseProduct[]; nextCursor: string | null; total: number };

/** Tamanho de cada lote: cabe numa tela grande com folga para rolar. */
export const SHOWCASE_PAGE_SIZE = 24;

/**
 * `?brand=A&brand=B`, não `brand[]=A`: é a forma que o servidor lê como lista.
 * O cartToken vai junto para a vitrine não descontar do disponível a reserva
 * do próprio visitante — senão o carrinho dele esconderia dele mesmo o
 * produto que ele acabou de escolher.
 */
function buildParams(filters: ShowcaseFilters, cursor: string | null) {
  const params = new URLSearchParams({ limit: String(SHOWCASE_PAGE_SIZE), cartToken: getCartToken() });
  if (cursor) params.set('cursor', cursor);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.promo) params.set('promo', '1');
  filters.brands.forEach(b => params.append('brand', b));
  filters.categories.forEach(c => params.append('category', c));
  return params;
}

export type ShowcaseStatus = 'loading' | 'idle' | 'loadingMore' | 'error' | 'errorMore';

/**
 * A vitrine em lotes. Trocar um filtro recomeça do primeiro lote; `loadMore`
 * pede o seguinte a partir do último produto recebido.
 *
 * Resposta atrasada de um filtro antigo é descartada: quem digita rápido na
 * busca dispara várias consultas, e só a última pode virar tela.
 */
export function useShowcase(filters: ShowcaseFilters) {
  const [items, setItems] = useState<ShowcaseProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ShowcaseStatus>('loading');

  const generation = useRef(0);
  const inFlight = useRef(false);
  const filtersKey = JSON.stringify(filters);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const myGeneration = generation.current;
    inFlight.current = true;
    setStatus(cursor ? 'loadingMore' : 'loading');

    try {
      const res = await api.get<ShowcasePage>('/products/showcase', {
        params: buildParams(JSON.parse(filtersKey) as ShowcaseFilters, cursor),
      });
      if (myGeneration !== generation.current) return;

      // Um produto que esgota no meio da rolagem já veio entre os com estoque
      // e voltaria entre os esgotados: a segunda aparição é descartada.
      setItems(prev => {
        if (!cursor) return res.data.items;
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...res.data.items.filter(p => !seen.has(p.id))];
      });
      setTotal(res.data.total);
      setNextCursor(res.data.nextCursor);
      setStatus('idle');
    } catch (err) {
      if (myGeneration !== generation.current) return;
      console.error('Erro ao buscar a vitrine:', err);
      setStatus(cursor ? 'errorMore' : 'error');
    } finally {
      if (myGeneration === generation.current) inFlight.current = false;
    }
  }, [filtersKey]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    fetchPage(null);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (inFlight.current || nextCursor === null) return;
    fetchPage(nextCursor);
  }, [fetchPage, nextCursor]);

  const retry = useCallback(() => {
    fetchPage(status === 'errorMore' ? nextCursor : null);
  }, [fetchPage, status, nextCursor]);

  return { items, total, hasMore: nextCursor !== null, status, loadMore, retry };
}

/**
 * Contagens dos filtros, total e destaque: o catálogo inteiro.
 *
 * Cabeçalho (opções de marca e categoria) e vitrine (destaque) pedem as mesmas
 * facetas ao mesmo tempo. Uma promessa compartilhada por alguns segundos faz
 * os dois saírem de uma resposta só, sem contexto nem provedor.
 */
const FACETS_TTL_MS = 30_000;
let facetsCache: { at: number; promise: Promise<ShowcaseFacets | null> } | null = null;

function loadFacets(): Promise<ShowcaseFacets | null> {
  if (facetsCache && Date.now() - facetsCache.at < FACETS_TTL_MS) return facetsCache.promise;

  const promise = api
    .get<ShowcaseFacets>('/products/showcase/facets', { params: { cartToken: getCartToken() } })
    .then(res => res.data)
    .catch(err => {
      console.error('Erro ao buscar os filtros da vitrine:', err);
      facetsCache = null; // falha não fica guardada: a próxima tela tenta de novo
      return null;
    });
  facetsCache = { at: Date.now(), promise };
  return promise;
}

export function useShowcaseFacets() {
  const [facets, setFacets] = useState<ShowcaseFacets | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadFacets().then(data => {
      if (!alive) return;
      setFacets(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return { facets, loading };
}
