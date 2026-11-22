import { DockingLabel } from '../components/DockingLabel';
import { Coupons } from '../components/settings/Coupons';
import { InstallmentPlans } from '../components/settings/InstallmentPlans';

import './Settings.css';

/** Ajustes numa página só: as regras de parcelamento e, abaixo, os cupons. */
export function Settings() {
  return (
    <div className="st">
      <header className="st-head">
        <span className="st-kicker">Regras da loja</span>
        <h1 className="st-title">Ajustes</h1>
      </header>
      <InstallmentPlans />
      <Coupons />
      {/* A palavra "Cupons", colada à borda de baixo da janela com a seta até o
          título aparecer; aí ela desliza até o lugar da mesma palavra no título
          e se encaixa, formando "Cupons de desconto". */}
      <DockingLabel
        slotId="cupons-slot"
        sectionId="cupons"
        label="Cupons"
        onActivate={() => document.getElementById('cupons')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      />
    </div>
  );
}
