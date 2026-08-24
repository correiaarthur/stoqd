import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from '../lib/pricingRules.js';

/**
 * Tabela de juros por parcelamento, do jeito que a tela edita: a lista toda.
 *
 * A faixa de 2x a 12x vem completa mesmo que o banco não tenha todas as
 * linhas — sem isso, um parcelamento que nunca foi configurado não teria como
 * ser ligado pela tela, porque não apareceria nela.
 */
export async function getInstallmentPlans(_req: Request, res: Response) {
  try {
    const saved = await prisma.installmentPlan.findMany({ orderBy: { installments: 'asc' } });
    const byInstallments = new Map(saved.map(plan => [plan.installments, plan]));

    const plans = [];
    for (let installments = MIN_INSTALLMENTS; installments <= MAX_INSTALLMENTS; installments++) {
      plans.push(byInstallments.get(installments) ?? { installments, interestPercent: 0, active: false });
    }

    return res.json(plans);
  } catch (error) {
    console.error("Erro ao carregar o parcelamento:", error);
    return res.status(500).json({ error: "Não foi possível carregar as opções de parcelamento." });
  }
}

/**
 * Salva a tabela inteira de uma vez.
 *
 * A tela edita todas as linhas juntas, então mandar a lista completa evita o
 * estado meio-salvo em que 3x já subiu de juros e 6x ainda não.
 */
export async function updateInstallmentPlans(req: Request, res: Response) {
  const rows = req.body?.plans;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Envie as opções de parcelamento." });
  }

  const parsed: Array<{ installments: number; interestPercent: number; active: boolean }> = [];
  const seen = new Set<number>();

  for (const row of rows) {
    const installments = Number(row?.installments);
    const interestPercent = Number(row?.interestPercent);

    if (!Number.isInteger(installments) || installments < MIN_INSTALLMENTS || installments > MAX_INSTALLMENTS) {
      return res.status(400).json({ error: `O parcelamento precisa ser entre ${MIN_INSTALLMENTS}x e ${MAX_INSTALLMENTS}x.` });
    }
    if (seen.has(installments)) {
      return res.status(400).json({ error: `${installments}x aparece duas vezes.` });
    }
    if (!Number.isFinite(interestPercent) || interestPercent < 0 || interestPercent > 100) {
      return res.status(400).json({ error: "A taxa de juros precisa ficar entre 0% e 100%." });
    }

    seen.add(installments);
    parsed.push({ installments, interestPercent, active: row?.active !== false });
  }

  try {
    await prisma.$transaction(
      parsed.map((plan) => prisma.installmentPlan.upsert({
        where: { installments: plan.installments },
        create: plan,
        update: { interestPercent: plan.interestPercent, active: plan.active },
      }))
    );

    const plans = await prisma.installmentPlan.findMany({ orderBy: { installments: 'asc' } });
    return res.json(plans);
  } catch (error) {
    console.error("Erro ao salvar o parcelamento:", error);
    return res.status(500).json({ error: "Não foi possível salvar as opções de parcelamento." });
  }
}
