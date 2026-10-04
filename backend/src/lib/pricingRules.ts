import type { Prisma$Tx } from './availability.js';
import { prisma } from './prisma.js';

/**
 * A ordem em que desconto e juros entram no total.
 *
 *   bruto     = soma dos itens
 *   desconto  = cupom + desconto manual   (nunca maior que o bruto)
 *   líquido   = bruto − desconto
 *   juros     = líquido × taxa do parcelamento
 *   total     = líquido + juros
 *
 * Os juros incidem sobre o líquido, não sobre o bruto: cobrar juros sobre um
 * valor que foi descontado é cobrar por dinheiro que a loja nunca emprestou.
 */

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 12;

export type InstallmentPlanView = {
  installments: number;
  interestPercent: number;
  active: boolean;
};

/** Opções que a loja deixou ligadas, em ordem. À vista não é uma delas. */
export async function listActivePlans(client: Prisma$Tx | typeof prisma = prisma): Promise<InstallmentPlanView[]> {
  return client.installmentPlan.findMany({
    where: { active: true },
    orderBy: { installments: 'asc' },
  });
}

/**
 * Taxa de um parcelamento. Lida do banco na hora de fechar a venda, nunca
 * recebida do cliente — senão o comprador escolheria os próprios juros.
 *
 * À vista e 1x são sempre 0%. Uma opção desligada devolve `null`: a venda
 * precisa recusar em vez de assumir zero, ou desligar uma opção viraria uma
 * forma silenciosa de dar desconto.
 */
export async function getInterestPercent(
  client: Prisma$Tx | typeof prisma,
  installments: number
): Promise<number | null> {
  if (installments <= 1) return 0;

  const plan = await client.installmentPlan.findUnique({ where: { installments } });

  if (!plan || !plan.active) return null;

  return plan.interestPercent;
}

/** Arredonda para centavos — Float acumula sobra em multiplicação. */
export function toCents(value: number) {
  return Math.round(value * 100) / 100;
}

export type TotalsInput = {
  grossTotal: number;
  discount: number;
  interestPercent: number;
};

export type Totals = {
  grossTotal: number;
  discount: number;
  netTotal: number;
  interest: number;
  finalTotal: number;
};

export function computeTotals({ grossTotal, discount, interestPercent }: TotalsInput): Totals {
  const cappedDiscount = toCents(Math.min(Math.max(discount, 0), grossTotal));
  const netTotal = toCents(grossTotal - cappedDiscount);
  const interest = toCents(netTotal * (interestPercent / 100));

  return {
    grossTotal: toCents(grossTotal),
    discount: cappedDiscount,
    netTotal,
    interest,
    finalTotal: toCents(netTotal + interest),
  };
}

/** Valor de cada parcela, só para exibir antes de a venda existir. */
export function previewInstallmentValue(finalTotal: number, installments: number) {
  return toCents(finalTotal / installments);
}
