/** Arredonda para centavos, como o servidor (`toCents`): Float acumula sobra. */
const toCents = (value: number) => Math.round(value * 100) / 100;

export type InstallmentSimulation = {
  /** Juros em reais sobre o valor. */
  interest: number;
  /** Valor total já com juros. */
  total: number;
  /** Valor de cada parcela. */
  perInstallment: number;
};

/**
 * Quanto ficaria um pedido num parcelamento, para a loja ver o efeito de uma
 * taxa antes de salvá-la.
 *
 * A conta é a mesma do servidor (`computeTotals` e `previewInstallmentValue`),
 * passo a passo e com o mesmo arredondamento: juros em centavos, total em
 * centavos, parcela em centavos. Fazer `valor * (1 + taxa) / parcelas` direto
 * pareceria igual e diferiria em um centavo de vez em quando — a loja veria
 * um número na simulação e a venda cobraria outro.
 *
 * Aqui a conta precisa ser local: a taxa que se simula ainda não foi salva,
 * então o servidor não a conhece.
 */
export function simulateInstallment(baseValue: number, interestPercent: number, installments: number): InstallmentSimulation {
  const base = toCents(Math.max(baseValue, 0));
  const interest = toCents(base * (interestPercent / 100));
  const total = toCents(base + interest);
  return {
    interest,
    total,
    perInstallment: installments > 0 ? toCents(total / installments) : total,
  };
}
