import { useCallback, useEffect, useState } from 'react';
import { getPaymentOptions } from '../services/checkout';

export type InstallmentOption = {
  installments: number;
  interestPercent: number;
  /** Total já com juros. */
  total: number;
  interest: number;
  installmentValue: number;
};

export type PaymentOptions = {
  upfront: { total: number };
  installmentOptions: InstallmentOption[];
};

/**
 * Opções de parcelamento para um valor.
 *
 * Quem faz a conta dos juros é o servidor, mesmo para exibir: se a tela
 * calculasse por conta própria, o número que o cliente vê e o que a venda cobra
 * poderiam divergir no dia em que a fórmula mudasse num dos dois lados.
 */
export function usePaymentOptions(netTotal: number) {
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [loading, setLoading] = useState(true);

  const rounded = Math.round(netTotal * 100) / 100;

  const fetchOptions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getPaymentOptions(rounded);
      setOptions(res.data);
    } catch (err) {
      console.error('Erro ao carregar formas de pagamento:', err);
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [rounded]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  return { options, loading };
}

/**
 * Total que será cobrado pela escolha atual — a mesma conta que o servidor faz.
 * Sem uma opção correspondente (parcelamento que a loja desligou depois),
 * cai no valor à vista em vez de inventar juros.
 */
export function totalsFor(
  netTotal: number,
  choice: { paymentType: 'VISTA' | 'PRAZO'; installmentsCount: number },
  options: InstallmentOption[]
) {
  if (choice.paymentType !== 'PRAZO') {
    return { interest: 0, total: netTotal, installmentValue: netTotal, interestPercent: 0 };
  }

  const option = options.find(o => o.installments === choice.installmentsCount);

  if (!option) return { interest: 0, total: netTotal, installmentValue: netTotal, interestPercent: 0 };

  return {
    interest: option.interest,
    total: option.total,
    installmentValue: option.installmentValue,
    interestPercent: option.interestPercent,
  };
}
