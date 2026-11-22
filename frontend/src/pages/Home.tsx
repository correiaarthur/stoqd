import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useShowcase, useShowcaseFacets, SHOWCASE_PAGE_SIZE,
  type ShowcaseFilters, type ShowcaseProduct,
} from '../hooks/useShowcase';
import { useCart } from '../contexts/cart';
import { isAdmin } from '../utils/auth';
import { formatCurrency } from '../utils/formatters';
import { toneFor } from '../utils/shelfTone';
import { LazyImage } from '../components/LazyImage';
import { ShowcaseToolbar } from '../components/ShowcaseToolbar';
import { useShowcaseFilters } from '../hooks/useShowcaseFilters';
import { ShelfSkeletonItems, ShowcaseSkeleton } from '../components/ShowcaseSkeleton';
import './Home.css';


/** Abaixo disso o produto ganha o selo "Últimas N". */
const LAST_UNITS = 3;

/** "Últimas 1" soa errado: a última é "Última unidade". */
const lastUnitsLabel = (n: number) => (n === 1 ? 'Última unidade' : `Últimas ${n}`);

/** Pausa da busca antes de ir ao servidor: uma consulta por palavra, não por letra. */
const SEARCH_DEBOUNCE_MS = 300;

/** Quanto antes do fim a próxima página começa a ser pedida. */
const PREFETCH_MARGIN = '800px 0px';

const isOnSale = (p: ShowcaseProduct) =>
  p.promotionalPrice !== null && p.promotionalPrice > 0 && p.promotionalPrice < p.sellingPrice;

function Bottle({ size }: { size: number }) {
  return (
    <svg width={size / 2} height={size} viewBox="0 0 40 80" fill="none" stroke="var(--papel)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="15" y="4" width="10" height="10" rx="2" />
      <path d="M16 14v6c-6 2-9 6-9 12v38a6 6 0 0 0 6 6h14a6 6 0 0 0 6-6V32c0-6-3-10-9-12v-6" />
    </svg>
  );
}

function ProductPicture({ product, bottleSize, eager = false }: { product: ShowcaseProduct; bottleSize: number; eager?: boolean }) {
  return product.imageUrl ? (
    // O fundo de esqueleto fica atrás enquanto a foto não chega.
    <div className="shelf-photo skeleton">
      <LazyImage src={product.imageUrl} alt={`Imagem de ${product.name}`} className="shelf-img" eager={eager} />
    </div>
  ) : (
    <div className="shelf-placeholder" style={{ background: toneFor(product.id) }}>
      <Bottle size={bottleSize} />
    </div>
  );
}

/** O valor só muda depois de `ms` sem mudança. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function Home() {
  const { items: cartItems, addItem } = useCart();

  // A vitrine é a superfície de escolher produto do visitante e de quem atende.
  // Para o balcão ela é ferramenta: sem destaque, sem explicação da reserva.
  const admin = isAdmin();

  const f = useShowcaseFilters();
  const debouncedSearch = useDebounced(f.search, SEARCH_DEBOUNCE_MS);
  const filters = useMemo<ShowcaseFilters>(
    () => ({ q: debouncedSearch, brands: f.brands, categories: f.categories, promo: f.promo }),
    [debouncedSearch, f.brands, f.categories, f.promo],
  );
  const hasFilter = f.hasFilter;

  const { facets, loading: facetsLoading } = useShowcaseFacets();
  const { items: products, total: shown, hasMore, status, loadMore, retry } = useShowcase(filters);

  // Trocar o filtro lá embaixo da lista recomeça a grade do primeiro produto:
  // a rolagem volta para o começo da prateleira, logo abaixo da barra grudada,
  // senão a pessoa fica olhando para o vazio onde estava o produto 60.
  const catalogRef = useRef<HTMLElement>(null);
  const filtersKey = JSON.stringify(filters);
  const lastFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (lastFiltersKey.current === filtersKey) return;
    lastFiltersKey.current = filtersKey;
    const catalog = catalogRef.current;
    if (!catalog) return;
    const bar = document.querySelector('.store-bar.is-sticky, .counter-toolbar');
    const barHeight = bar?.getBoundingClientRect().height ?? 0;
    const top = catalog.getBoundingClientRect().top - barHeight - 12;
    if (top < 0) window.scrollTo({ top: window.scrollY + top, behavior: 'smooth' });
  }, [filtersKey]);

  // Sentinela no fim da grade: quando ela chega a 800px da tela, o próximo
  // lote já está sendo pedido — a pessoa raramente vê o fim antes dele.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || status !== 'idle') return;

    const observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) loadMore(); },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, status, loadMore, products.length]);

  const clearFilters = f.clear;

  // Primeira carga: a página inteira em esqueleto. Depois disso, trocar
  // filtro só refaz a grade — o destaque e os filtros não piscam.
  const firstLoad = status === 'loading' && products.length === 0 && (facetsLoading || !facets);
  if (firstLoad) return <ShowcaseSkeleton admin={admin} />;

  const highlights = facets?.highlights ?? [];
  const refreshing = status === 'loading';

  return (
    <div className={`showcase ${admin ? 'showcase-counter' : ''}`}>
      {admin ? (
        <header className="page-head showcase-admin-head">
          <div className="page-head-title">
            <span className="eyebrow">Balcão</span>
            <h1 className="page-title">Vitrine</h1>
          </div>
        </header>
      ) : (
        // Com filtro ligado, a pessoa está procurando: o destaque sai da frente
        // e o resultado aparece logo abaixo da barra.
        highlights.length > 0 && !hasFilter && (
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="label-caps hero-kicker">Nesta edição</span>
              <h1 id="hero-title" className="hero-title">
                O cuidado que você já conhece, <em>perto de casa.</em>
              </h1>
              <div className="hero-foot">
                <p>O que aparece aqui existe na prateleira. Escolha, a loja reserva para você e separa para a retirada.</p>
                <div className="hero-actions">
                  <a href="#catalogo" className="btn-ink">
                    Ler a vitrine
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  </a>
                  <a href="#como" className="hero-link">Como funciona a reserva</a>
                </div>
              </div>
            </div>

            {/* Até três destaques: o primeiro grande, os outros dois menores ao
                lado. Com dois, lado a lado; com um, sozinho. */}
            <div className={`hero-picks hero-count-${highlights.length}`}>
              {highlights.map((product, i) => (
                <figure className="hero-figure" key={product.id}>
                  <div className="hero-picture">
                    <span className="hero-number" aria-hidden="true">Nº {String(i + 1).padStart(2, '0')}</span>
                    <ProductPicture product={product} bottleSize={i === 0 ? 300 : 160} eager={i === 0} />
                  </div>
                  <figcaption className="hero-caption">
                    <span className="hero-caption-name">
                      <span className="label-caps">{[product.brand?.name, product.category?.name].filter(Boolean).join(' · ')}</span>
                      <span className="serif">{product.name}</span>
                    </span>
                    <span className="hero-caption-price">
                      <strong>{formatCurrency(product.activePrice)}</strong>
                      {product.available <= LAST_UNITS && <span>{lastUnitsLabel(product.available)}</span>}
                    </span>
                  </figcaption>
                  <HeroAdd product={product} inCart={cartItems.find(item => item.productId === product.id)?.quantity ?? 0} onAdd={() => addItem(product)} />
                </figure>
              ))}
            </div>
          </section>
        )
      )}

      <section id="catalogo" ref={catalogRef} className="catalog" aria-labelledby="catalog-title">
        {/* O balcão não tem o cabeçalho da loja: a barra mora aqui, grudada no
            topo da área de trabalho. */}
        {admin && <ShowcaseToolbar className="counter-toolbar" />}

        <div className="catalog-head">
          <h2 id="catalog-title" className="catalog-title">Na prateleira <em>hoje</em></h2>
          {/* Só diz algo quando há filtro: sem filtro, nada ocupa o lugar. A
              região fica sempre montada para o leitor de tela anunciar a
              mudança no momento em que o primeiro filtro é ligado. */}
          <div className="catalog-summary">
            <span aria-live="polite">
              {!hasFilter
                ? ''
                : refreshing
                  ? 'Procurando na prateleira…'
                  : `${shown} ${shown === 1 ? 'produto encontrado' : 'produtos encontrados'}`}
            </span>
            {hasFilter && (
              <button type="button" className="btn-link" onClick={clearFilters}>Limpar filtros</button>
            )}
          </div>
        </div>

        {status === 'error' ? (
          <div className="shelf-empty">
            <p className="shelf-empty-title">Não deu para abrir a prateleira.</p>
            <p>Confira a conexão e tente de novo.</p>
            <button type="button" className="btn-ink" onClick={retry}>Tentar de novo</button>
          </div>
        ) : refreshing ? (
          <div className={`shelf ${hasFilter ? '' : 'shelf-editorial'}`} role="status" aria-busy="true">
            <span className="sr-only">Carregando produtos...</span>
            <ShelfSkeletonItems count={6} />
          </div>
        ) : products.length === 0 ? (
          <div className="shelf-empty">
            <p className="shelf-empty-title">Nada na prateleira com esses filtros.</p>
            <p>Tente outra palavra ou tire uma marca ou tipo da seleção.</p>
            <button type="button" className="btn-ink" onClick={clearFilters}>Ver todos os produtos</button>
          </div>
        ) : (
          <>
            <div className={`shelf ${hasFilter ? '' : 'shelf-editorial'}`}>
              {products.map(product => (
                <ShelfItem
                  key={product.id}
                  product={product}
                  admin={admin}
                  inCart={cartItems.find(item => item.productId === product.id)?.quantity ?? 0}
                  onAdd={() => addItem(product)}
                />
              ))}
              {status === 'loadingMore' && <ShelfSkeletonItems count={3} />}
            </div>

            <div ref={sentinelRef} className="shelf-end">
              {status === 'loadingMore' && <span className="sr-only" role="status">Carregando mais produtos...</span>}
              {status === 'errorMore' && (
                <p className="shelf-end-error">
                  Não deu para carregar mais produtos.
                  <button type="button" className="btn-link" onClick={retry}>Tentar de novo</button>
                </p>
              )}
              {!hasMore && products.length > SHOWCASE_PAGE_SIZE && (
                <p className="shelf-end-note">Isso é tudo! :)</p>
              )}
            </div>
          </>
        )}
      </section>

      {!admin && (
        <section id="como" className="how" aria-labelledby="how-title">
          <div className="how-inner">
            <h2 id="how-title" className="how-title">Como a reserva <em>funciona</em></h2>
            <div className="how-steps">
              <div className="how-step">
                <span className="how-numeral" aria-hidden="true">i.</span>
                <h3>Estoque conferido</h3>
                <p>O que está na vitrine existe na prateleira. Nada de pedido que não pode ser atendido.</p>
              </div>
              <div className="how-step">
                <span className="how-numeral" aria-hidden="true">ii.</span>
                <h3>Reserva enquanto decide</h3>
                <p>Cinco minutos para quem está olhando, trinta depois de entrar na conta.</p>
              </div>
              <div className="how-step">
                <span className="how-numeral" aria-hidden="true">iii.</span>
                <h3>Retirada combinada</h3>
                <p>A loja confirma por telefone e separa. Você paga na retirada.</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** O destaque também reserva: quem se interessa não precisa rolar até a prateleira. */
function HeroAdd({ product, inCart, onAdd }: { product: ShowcaseProduct; inCart: number; onAdd: () => void }) {
  const soldOut = product.available - inCart < 1;
  const label = soldOut
    ? (inCart > 0 ? 'Tudo na sacola' : 'Esgotado')
    : (inCart > 0 ? 'Reservar mais um' : 'Reservar');

  return (
    <button type="button" className="hero-add" disabled={soldOut} onClick={onAdd} aria-label={`${label}: ${product.name}`}>
      {label}
      {inCart > 0 && <span className="hero-add-count">{inCart} na sacola</span>}
    </button>
  );
}

function ShelfItem({ product, admin, inCart, onAdd }: {
  product: ShowcaseProduct; admin: boolean; inCart: number; onAdd: () => void;
}) {
  // Para o visitante vale o disponível: o que outra pessoa reservou não é
  // dele. Para o balcão vale o físico — quem está com o produto na mão vende
  // (decisão D2), e a reserva vira só um aviso.
  const sellable = admin ? product.quantity : product.available;
  const reserved = product.quantity - product.available;
  const soldOut = sellable - inCart < 1;
  const onSale = isOnSale(product);

  const seal = sellable < 1
    ? { text: 'Esgotado', className: 'selo-esgotado' }
    : onSale
      ? { text: 'Promoção', className: 'selo-promo' }
      : sellable <= LAST_UNITS
        ? { text: lastUnitsLabel(sellable), className: 'selo-aviso' }
        : null;

  const action = admin ? 'Adicionar' : 'Reservar';
  const longLabel = soldOut
    ? (inCart > 0 ? 'Tudo na sacola' : 'Esgotado')
    : (inCart > 0 ? `${action} mais um` : action);
  const shortLabel = soldOut
    ? (inCart > 0 ? 'Na sacola' : 'Esgotado')
    : (inCart > 0 ? '+1' : action);

  return (
    <article
      className={`shelf-item ${sellable < 1 ? 'is-sold-out' : ''}`}
      // O tom de prateleira do produto vira a cor do rastro que a folha deixa
      // ao avançar: cada produto, a sua trilha.
      style={{ '--tone': toneFor(product.id) } as React.CSSProperties}
    >
      {/* A folha fica numa camada própria para a lateral verde (o ::before do
          article) poder ficar atrás dela sem ser recortada pelo contorno. */}
      <div className="shelf-leaf">
      <div className="shelf-picture">
        <ProductPicture product={product} bottleSize={140} />
        {seal && <span className={`selo shelf-seal ${seal.className}`}>{seal.text}</span>}
        {inCart > 0 && <span className="shelf-in-bag">{inCart} na sacola</span>}
      </div>
      <div className="shelf-label">
        <span className="label-caps">
          {[product.brand?.name, product.category?.name].filter(Boolean).join(' · ')}
        </span>
        <h3 className="shelf-name">{product.name}</h3>
        {admin && reserved > 0 && (
          <span className="shelf-note">{product.quantity} un · {reserved} reservada(s)</span>
        )}
      </div>
      <div className="shelf-buy">
        <span className="shelf-price">
          {onSale && <s>{formatCurrency(product.sellingPrice)}</s>}
          <strong>{formatCurrency(product.activePrice)}</strong>
        </span>
        {/* Duas versões do rótulo: a curta só aparece no card compacto do
            telefone (três por fileira). O nome acessível é sempre a frase
            inteira — "+1" sozinho não diz nada a quem ouve a tela. */}
        <button type="button" className="shelf-button" disabled={soldOut} onClick={onAdd} aria-label={longLabel}>
          <span className="label-long" aria-hidden="true">{longLabel}</span>
          <span className="label-short" aria-hidden="true">{shortLabel}</span>
        </button>
      </div>
      </div>
    </article>
  );
}
