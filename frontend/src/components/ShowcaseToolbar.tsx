import { useSyncExternalStore, type ReactNode } from 'react';
import { useShowcaseFacets } from '../hooks/useShowcase';
import { useShowcaseFilters } from '../hooks/useShowcaseFilters';
import { MultiSelect } from './MultiSelect';
import './ShowcaseToolbar.css';

const NARROW = '(max-width: 560px)';
const subscribeNarrow = (onChange: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
/** Tela de telefone: o texto de exemplo da busca precisa ser curto. */
function useNarrow() {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

/**
 * Busca e filtros da vitrine: uma folha de busca e três folhas de filtro
 * (marca, categoria, promoção), soltas lado a lado e com o mesmo formato.
 *
 * Para quem compra, mora no cabeçalho, com a sacola ao lado (`trailing`); no
 * balcão, dentro da página. O estado é a URL, então os dois falam a mesma
 * língua.
 */
export function ShowcaseToolbar({ className, trailing }: {
  className?: string;
  /** O que fecha a barra à direita — no cabeçalho da loja, a sacola. */
  trailing?: ReactNode;
}) {
  const f = useShowcaseFilters();
  const { facets, loading } = useShowcaseFacets();
  const narrow = useNarrow();

  const brandOptions = facets?.brands ?? [];
  const categoryOptions = facets?.categories ?? [];
  const promoCount = facets?.promo ?? 0;
  const promoOff = !loading && promoCount === 0 && !f.promo;

  return (
    <div id="filtros" role="search" className={`toolbar ${className ?? ''}`}>
      <div className="toolbar-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
        <label htmlFor="busca-vitrine" className="sr-only">Buscar produto na vitrine</label>
        <input
          id="busca-vitrine"
          type="search"
          placeholder={narrow ? 'Buscar na vitrine' : 'Buscar produto ou marca'}
          value={f.search}
          onChange={e => f.setSearch(e.target.value)}
        />
      </div>

      <div className="toolbar-controls">
        {loading ? (
          // Lugar reservado enquanto as opções chegam: nada "pula" na barra.
          <>
            <span className="skeleton toolbar-skeleton" aria-hidden="true" />
            <span className="skeleton toolbar-skeleton" aria-hidden="true" />
          </>
        ) : (
          <>
            {brandOptions.length > 0 && (
              <MultiSelect label="Marca" options={brandOptions} selected={f.brands} onChange={f.setBrands} />
            )}
            {categoryOptions.length > 0 && (
              <MultiSelect label="Categoria" options={categoryOptions} selected={f.categories} onChange={f.setCategories} />
            )}
          </>
        )}
        {/* Promoção fica sempre na barra, mesmo sem nenhuma ativa: sumir fazia
            parecer que o filtro não existe. Sem promoção, aparece desligada e
            diz por quê — a não ser que já esteja ligada, para poder
            desligar. */}
        <button
          type="button"
          className="chip chip-promo"
          aria-pressed={f.promo}
          onClick={() => f.setPromo(!f.promo)}
          disabled={promoOff}
          title={promoOff ? 'Nenhum produto em promoção agora' : undefined}
        >
          {f.promo && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          )}
          Promoção <span className="chip-count">{promoCount}</span>
        </button>
      </div>

      {trailing && <div className="toolbar-trailing">{trailing}</div>}
    </div>
  );
}
