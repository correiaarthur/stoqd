/**
 * Esqueletos da vitrine, nos mesmos blocos da página carregada, para nada
 * mudar de lugar quando os produtos chegam.
 */

/** Produtos fantasmas da prateleira: a primeira carga e o lote seguinte. */
export function ShelfSkeletonItems({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div className="shelf-item" key={`sk-${i}`} aria-hidden="true">
          <div className="shelf-leaf">
          <span className="skeleton shelf-picture" />
          <div className="shelf-label">
            <span className="skeleton skeleton-line" style={{ width: 120 }} />
            <span className="skeleton skeleton-line" style={{ width: '80%', height: 20 }} />
          </div>
          <div className="shelf-buy">
            <span className="skeleton skeleton-line" style={{ width: 80, height: 20 }} />
            <span className="skeleton skeleton-button" />
          </div>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * A página inteira enquanto nada chegou: destaque, título e grade. A busca e
 * os filtros moram no cabeçalho, que guarda o próprio lugar enquanto carrega.
 * O texto "Carregando vitrine..." continua existindo para leitor de tela (e
 * para o teste de captura, que espera ele sumir antes de fotografar).
 */
export function ShowcaseSkeleton({ admin }: { admin: boolean }) {
  return (
    <div className={`showcase ${admin ? 'showcase-counter' : ''}`} role="status" aria-busy="true">
      <span className="sr-only">Carregando vitrine...</span>

      {admin ? (
        <div className="page-head showcase-admin-head" aria-hidden="true">
          <div className="page-head-title">
            <span className="skeleton skeleton-line" style={{ width: 70 }} />
            <span className="skeleton skeleton-title" style={{ width: 260 }} />
          </div>
        </div>
      ) : (
        <div className="hero skeleton-hero" aria-hidden="true">
          <div className="hero-copy">
            <span className="skeleton skeleton-line skeleton-on-rosa" style={{ width: 110 }} />
            <span className="skeleton skeleton-display skeleton-on-rosa" />
            <span className="skeleton skeleton-display skeleton-on-rosa" style={{ width: '70%' }} />
            <span className="skeleton skeleton-block skeleton-on-rosa" style={{ height: 64 }} />
          </div>
          <div className="hero-picks hero-count-3">
            <span className="skeleton skeleton-on-rosa" />
            <span className="skeleton skeleton-on-rosa" />
            <span className="skeleton skeleton-on-rosa" />
          </div>
        </div>
      )}

      <div className="catalog" aria-hidden="true">
        <div className="catalog-head">
          <span className="skeleton skeleton-title" style={{ width: 'min(100%, 360px)' }} />
        </div>
        <div className={`shelf ${admin ? '' : 'shelf-editorial'}`}>
          <ShelfSkeletonItems count={6} />
        </div>
      </div>
    </div>
  );
}
