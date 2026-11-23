import { useCallback } from 'react';
import { getPaymentOptions } from '../services/checkout';
import { useAsync } from './useAsync';

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
  const rounded = Math.round(netTotal * 100) / 100;

  const fetchOptions = useCallback(
    () => getPaymentOptions(rounded).then(res => res.data as PaymentOptions),
    [rounded]
  );

  // Na falha as opções somem em vez de ficarem as do valor anterior: elas
  // mostrariam juros de um total que já não é o da tela.
  const { data: options, loading } = useAsync<PaymentOptions | null>(fetchOptions, {
    initial: null,
    errorMessage: 'Erro ao carregar formas de pagamento:',
    resetOnError: true,
  });

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
