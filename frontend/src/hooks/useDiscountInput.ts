import { useState } from 'react';

import { parseCurrencyInput, parsePercentInput } from '../utils/formatters';

export type DiscountType = 'fixed' | 'percentage';

/**
 * O desconto que o caixa digita no balcão, em reais ou em porcentagem.
 *
 * `inReais` é o que de fato se aplica: nunca passa do total dos produtos — mesma
 * regra do servidor, repetida aqui só para a tela não prometer outro número.
 * `rawInReais` é o que foi digitado, sem o teto.
 */
export function useDiscountInput(itemsTotal: number) {
  const [input, setInput] = useState('');
  const [type, setTypeState] = useState<DiscountType>('fixed');

  const typed = Number(input) || 0;
  const rawInReais = type === 'percentage' ? itemsTotal * (typed / 100) : typed;
  const inReais = Math.min(rawInReais, itemsTotal);

  /** Trocar de R$ para % (ou o inverso) limpa o campo: o número não significa o mesmo. */
  const setType = (next: DiscountType) => {
    setTypeState(next);
    setInput('');
  };

  const onInputChange = (value: string) => {
    setInput(type === 'percentage' ? parsePercentInput(value) : parseCurrencyInput(value));
  };

  const reset = () => {
    setInput('');
    setTypeState('fixed');
  };

  return { input, type, setType, onInputChange, reset, rawInReais, inReais };
}
