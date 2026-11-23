import { useState } from 'react';

import { useInstallmentPlans } from '../../hooks/useInstallmentPlans';
import { PlanCell } from './PlanCell';
import { PlansSkeleton } from './PlansSkeleton';
import { SimulationBar } from './SimulationBar';

/** Tabela de juros por parcelamento, com a simulação ao lado. */
export function InstallmentPlans() {
  const { plans, saved, loading, isSaving, message, error, maxActive, patch, setLimit, save } = useInstallmentPlans();

  // Valor do pedido da simulação, no formato dos outros campos de dinheiro.
  const [simulated, setSimulated] = useState('300.00');

  if (loading) return <PlansSkeleton />;

  return (
    <section className="st-plans" aria-labelledby="parc-titulo">
      <div className="st-plans-intro">
        <h2 id="parc-titulo" className="st-h2">Parcelamento <em>e juros</em></h2>
        <p>
          O que a cliente vê no checkout sai daqui. 0% aparece como “sem juros”;
          uma faixa desligada some da lista e não pode ser usada em venda nenhuma — nem no balcão.
          A taxa é aplicada sobre o valor já com desconto.
        </p>
        <div className="st-field">
          <label htmlFor="a-max">Parcelar em até</label>
          <select id="a-max" value={maxActive} onChange={e => setLimit(Number(e.target.value))}>
            {maxActive === 0 && <option value={0}>nenhuma faixa</option>}
            {plans.map(plan => <option key={plan.installments} value={plan.installments}>{plan.installments} vezes</option>)}
          </select>
        </div>

        <SimulationBar value={simulated} onChange={setSimulated} />
      </div>

      <div className="st-plans-main">
        <div className="plans-grid">
          {plans.map(plan => (
            <PlanCell
              key={plan.installments}
              plan={plan}
              saved={saved.find(p => p.installments === plan.installments)}
              base={Number(simulated) || 0}
              onRate={(installments, interestPercent) => patch(installments, { interestPercent })}
            />
          ))}
        </div>

        {error && <div className="settings-error">{error}</div>}
        {message && <div className="settings-success" role="status">{message}</div>}

        <div className="st-plans-foot">
          <button type="button" className="st-save" onClick={save} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar parcelamento'}
          </button>
        </div>
      </div>
    </section>
  );
}
