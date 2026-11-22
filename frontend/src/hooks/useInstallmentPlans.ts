import { useEffect, useState } from 'react';

import type { Plan } from '../components/settings/types';
import { getInstallmentPlans, saveInstallmentPlans } from '../services/settings';
import { getApiErrorMessage } from '../utils/errors';

/**
 * A tabela de juros por parcelamento, editada toda junto e salva de uma vez:
 * linha a linha daria o estado meio-salvo em que 3x já subiu de juros e 6x ainda
 * não.
 */
export function useInstallmentPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  // O que está salvo, para a simulação mostrar o antes ao lado do depois.
  const [saved, setSaved] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getInstallmentPlans()
      .then(res => { setPlans(res.data || []); setSaved(res.data || []); })
      .catch(err => console.error('Erro ao carregar parcelamento:', err))
      .finally(() => setLoading(false));
  }, []);

  /** Muda a taxa (ou o estado) de uma faixa. */
  const patch = (installments: number, changes: Partial<Plan>) => {
    setPlans(prev => prev.map(plan => (plan.installments === installments ? { ...plan, ...changes } : plan)));
    setMessage('');
  };

  // O limite é a maior parcela ligada. Mudar o limite liga as faixas até ele e
  // desliga as de cima, como o desenho: uma faixa acima do limite fica apagada.
  const maxActive = plans.reduce((max, plan) => (plan.active ? Math.max(max, plan.installments) : max), 0);

  const setLimit = (limit: number) => {
    setPlans(prev => prev.map(plan => ({ ...plan, active: plan.installments <= limit })));
    setMessage('');
  };

  const save = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);

    try {
      const res = await saveInstallmentPlans(plans);
      setPlans(res.data || []);
      setSaved(res.data || []);
      setMessage('Parcelamento salvo.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  return { plans, saved, loading, isSaving, message, error, maxActive, patch, setLimit, save };
}
