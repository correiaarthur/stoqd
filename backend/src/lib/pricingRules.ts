import { z } from 'zod';

import type { Prisma$Tx } from './availability.js';
import { prisma } from './prisma.js';
import { bodyOf, isBlank } from './validate.js';

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

/**
 * Quantidade de parcelas vinda de fora (corpo da requisição).
 *
 * Só inteiro de 1 a 12. `Number(x) || 1` deixava passar `0.5` e `-3`: a taxa de
 * "1x ou menos" é 0%, o pedido era aceito e a venda nascia a prazo, com total e
 * sem nenhuma parcela — a dívida sumia da lista de clientes. Ausente (`undefined`,
 * `null` ou vazio) vale 1; qualquer outra coisa inválida devolve `null`.
 */
export function parseInstallmentsCount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return 1;

  const count = typeof raw === 'number' ? raw : Number(String(raw).trim());

  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS ? count : null;
}

export const MSG_PARCELAS = "O parcelamento precisa ser de 1x a 12x.";

/**
 * `parseInstallmentsCount` como schema: o número de parcelas, ou o erro que a
 * tela mostra. Ausente vale 1. Mesma regra estrita de antes — `true`, `[]`,
 * `"3x"` e `0.5` são recusados — que o `Number()` do Zod deixaria passar.
 */
export const installmentsCountSchema = z.unknown().transform((value, ctx) => {
  const count = parseInstallmentsCount(value);

  if (count === null) {
    ctx.issues.push({ code: 'custom', message: MSG_PARCELAS, input: value });
    return z.NEVER;
  }

  return count;
});

/** Parcelas que podem faltar: ausente é `undefined` (sem troca), não 1x. */
export const optionalInstallmentsCount = z.preprocess(
  value => (isBlank(value) ? undefined : value),
  installmentsCountSchema.optional()
);

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

/** Uma linha de venda: o que ela custa por si. */
export type PricedLine = {
  quantity: number;
  unitPrice: number;
};

/**
 * Quanto custa uma linha. Trivial de escrever à mão — e era escrita à mão em
 * cinco telas, o que é justamente o problema: no dia em que a linha ganhar
 * desconto próprio, cinco lugares precisam concordar sobre a nova fórmula.
 */
export function lineTotal(line: PricedLine) {
  return line.unitPrice * line.quantity;
}

/**
 * O bruto: soma das linhas, o primeiro passo do fluxo documentado acima.
 *
 * Esta é a conta que decide quanto o cliente paga, e estava copiada em doze
 * lugares — venda, pedido, confirmação, extrato, carrinho, aviso de pedido
 * novo. Todas concordavam. Bastava uma passar a considerar desconto de linha
 * para o total da tela deixar de bater com o da venda, sem erro e sem log.
 */
export function sumLines(lines: readonly PricedLine[]) {
  return lines.reduce((acc, line) => acc + lineTotal(line), 0);
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


const MSG_JUROS = "A taxa de juros precisa ficar entre 0% e 100%.";

/**
 * A tabela de juros por parcelamento, do jeito que a tela a salva: a lista toda.
 * Faixa repetida ou fora de 2x–12x é recusada.
 */
export const installmentPlansSchema = bodyOf({
  plans: z.array(
    bodyOf({
      installments: z.coerce.number({ error: `O parcelamento precisa ser entre ${MIN_INSTALLMENTS}x e ${MAX_INSTALLMENTS}x.` })
        .int({ error: `O parcelamento precisa ser entre ${MIN_INSTALLMENTS}x e ${MAX_INSTALLMENTS}x.` })
        .min(MIN_INSTALLMENTS, { error: `O parcelamento precisa ser entre ${MIN_INSTALLMENTS}x e ${MAX_INSTALLMENTS}x.` })
        .max(MAX_INSTALLMENTS, { error: `O parcelamento precisa ser entre ${MIN_INSTALLMENTS}x e ${MAX_INSTALLMENTS}x.` }),
      interestPercent: z.coerce.number({ error: MSG_JUROS }).min(0, { error: MSG_JUROS }).max(100, { error: MSG_JUROS }),
      active: z.preprocess(value => value !== false, z.boolean()),
    }),
    { error: "Envie as opções de parcelamento." }
  )
    .min(1, { error: "Envie as opções de parcelamento." })
    .superRefine((plans, ctx) => {
      const seen = new Set<number>();

      for (const plan of plans) {
        if (seen.has(plan.installments)) {
          ctx.addIssue({ code: 'custom', message: `${plan.installments}x aparece duas vezes.` });
          return;
        }
        seen.add(plan.installments);
      }
    }),
});
