import { formatCurrency } from '../../utils/formatters';
import { simulateInstallment } from '../../utils/installments';
import type { Plan } from './types';

/**
 * O que um parcelamento faz com o valor simulado: parcela, total e — se a taxa
 * foi mexida e ainda não salva — o que era antes.
 */
export function PlanExample({ plan, saved, base }: { plan: Plan; saved: Plan | undefined; base: number }) {
  if (base <= 0) return null;

  const now = simulateInstallment(base, plan.interestPercent, plan.installments);
  const before = saved && saved.interestPercent !== plan.interestPercent
    ? simulateInstallment(base, saved.interestPercent, plan.installments)
    : null;
  const delta = before ? now.perInstallment - before.perInstallment : 0;

  return (
    <span className="plan-example">
      {/* O "3x" já está na própria faixa: aqui só o valor da parcela. */}
      <strong>{formatCurrency(now.perInstallment)}/parcela</strong>
      {plan.interestPercent > 0 && <span>total {formatCurrency(now.total)}</span>}
      {before && (
        <span className="plan-was">
          antes {formatCurrency(before.perInstallment)} ({saved?.interestPercent}%) ·{' '}
          {delta === 0 ? 'mesma parcela' : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`}
        </span>
      )}
    </span>
  );
}
