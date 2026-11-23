import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filtros da vitrine, guardados no endereço.
 *
 * A barra de busca mora no cabeçalho e a grade, na página: são componentes
 * separados, e a URL é o lugar que os dois enxergam sem precisar de contexto.
 * De quebra, um link filtrado abre filtrado — `?marca=Avon&promo=1` serve
 * para mandar a alguém "as promoções da Avon".
 */
export function useShowcaseFilters() {
  const [params, setParams] = useSearchParams();

  const search = params.get('q') ?? '';
  const promo = params.get('promo') === '1';
  // getAll devolve um array novo a cada render; a chave em texto estabiliza.
  const brandsKey = params.getAll('marca').join('\u0000');
  const categoriesKey = params.getAll('categoria').join('\u0000');
  const brands = useMemo(() => (brandsKey ? brandsKey.split('\u0000') : []), [brandsKey]);
  const categories = useMemo(() => (categoriesKey ? categoriesKey.split('\u0000') : []), [categoriesKey]);

  const update = useCallback((change: (next: URLSearchParams) => void) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      change(next);
      return next;
    }, { replace: true });
  }, [setParams]);

  const setList = (key: string, list: string[]) => (next: URLSearchParams) => {
    next.delete(key);
    list.forEach(value => next.append(key, value));
  };

  return {
    search,
    brands,
    categories,
    promo,
    hasFilter: search.trim() !== '' || brands.length > 0 || categories.length > 0 || promo,
    setSearch: (value: string) => update(next => (value ? next.set('q', value) : next.delete('q'))),
    setBrands: (list: string[]) => update(setList('marca', list)),
    setCategories: (list: string[]) => update(setList('categoria', list)),
    setPromo: (on: boolean) => update(next => (on ? next.set('promo', '1') : next.delete('promo'))),
    clear: () => setParams(new URLSearchParams(), { replace: true }),
  };
}
