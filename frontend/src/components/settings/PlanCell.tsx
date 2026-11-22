import { parsePercentInput } from '../../utils/formatters';
import { PlanExample } from './PlanExample';
import type { Plan } from './types';

type Props = {
  plan: Plan;
  /** A faixa como está salva, para a simulação mostrar o antes. */
  saved: Plan | undefined;
  /** O valor do pedido da simulação. */
  base: number;
  onRate: (installments: number, interestPercent: number) => void;
};

/** Uma faixa de parcelamento: "3x", a nota (com/sem juros), a simulação e a taxa. */
export function PlanCell({ plan, saved, base, onRate }: Props) {
  return (
    <div className={`plan-cell ${plan.active ? '' : 'off'}`}>
      <span className="plan-info">
        <span className="plan-times">{plan.installments}x</span>
        <span className={`plan-note ${plan.active ? (plan.interestPercent > 0 ? '' : 'free') : 'muted'}`}>
          {plan.active ? (plan.interestPercent > 0 ? 'com juros' : 'sem juros') : 'acima do limite'}
        </span>
        {plan.active && <PlanExample plan={plan} saved={saved} base={base} />}
      </span>
      <span className="plan-rate">
        <label className="sr-only" htmlFor={`j${plan.installments}`}>Juros em {plan.installments}x</label>
        <input
          id={`j${plan.installments}`}
          type="text"
          value={String(plan.interestPercent)}
          onChange={e => onRate(plan.installments, Number(parsePercentInput(e.target.value)) || 0)}
          disabled={!plan.active}
        />
        <span className="plan-unit">%</span>
      </span>
    </div>
  );
}
