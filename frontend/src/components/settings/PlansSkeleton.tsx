export function PlansSkeleton() {
  return (
    <section className="st-plans" role="status" aria-busy="true" aria-label="Carregando o parcelamento">
      <div className="st-plans-intro">
        <span className="skeleton" style={{ width: 260, height: 40 }} />
        <span className="skeleton skeleton-line" style={{ width: '100%', height: 14 }} />
        <span className="skeleton skeleton-line" style={{ width: '92%', height: 14 }} />
        <span className="skeleton skeleton-line" style={{ width: '70%', height: 14 }} />
        <span className="skeleton" style={{ width: '100%', height: 48 }} />
      </div>
      <div className="plans-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="plan-cell"><span className="skeleton" style={{ width: '100%', height: 64 }} /></div>
        ))}
      </div>
    </section>
  );
}
