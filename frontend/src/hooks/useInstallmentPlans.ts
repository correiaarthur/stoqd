import { useState } from 'react';

import type { Plan } from '../components/settings/types';
import { getInstallmentPlans, saveInstallmentPlans } from '../services/settings';
import { getApiErrorMessage } from '../utils/errors';
import { useAsync } from './useAsync';

const fetchPlans = () => getInstallmentPlans().then(res => (res.data || []) as Plan[]);

/**
 * A tabela de juros por parcelamento, editada toda junto e salva de uma vez:
 * linha a linha daria o estado meio-salvo em que 3x já subiu de juros e 6x ainda
 * não.
 *
 * `saved` é o que o servidor tem. `plans` é o que está na tela: o mesmo `saved`
 * até a primeira edição, depois o rascunho — sem copiar um para o outro com um
 * efeito, que é como os dois acabam divergindo.
 */
export function useInstallmentPlans() {
  const { data: saved, setData: setSaved, loading } = useAsync<Plan[]>(fetchPlans, {
    initial: [],
    errorMessage: 'Erro ao carregar parcelamento:',
  });

  // `null` é "nada editado": a tela mostra o que está salvo.
  const [draft, setDraft] = useState<Plan[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const plans = draft ?? saved;

  // Funcional: duas edições no mesmo lote partem uma da outra, não do mesmo `plans`.
  const edit = (change: (current: Plan[]) => Plan[]) => {
    setDraft(current => change(current ?? saved));
    setMessage('');
  };

  /** Muda a taxa (ou o estado) de uma faixa. */
  const patch = (installments: number, changes: Partial<Plan>) =>
    edit(current => current.map(plan => (plan.installments === installments ? { ...plan, ...changes } : plan)));

  // O limite é a maior parcela ligada. Mudar o limite liga as faixas até ele e
  // desliga as de cima, como o desenho: uma faixa acima do limite fica apagada.
  const maxActive = plans.reduce((max, plan) => (plan.active ? Math.max(max, plan.installments) : max), 0);

  const setLimit = (limit: number) =>
    edit(current => current.map(plan => ({ ...plan, active: plan.installments <= limit })));

  const save = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);

    try {
      const res = await saveInstallmentPlans(plans);
      setSaved(res.data || []);
      setDraft(null);
      setMessage('Parcelamento salvo.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  return { plans, saved, loading, isSaving, message, error, maxActive, patch, setLimit, save };
}
