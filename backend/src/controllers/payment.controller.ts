import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { checkCoupon } from '../lib/coupons.js';
import { computeTotals, listActivePlans, previewInstallmentValue } from '../lib/pricingRules.js';

/**
 * Opções de pagamento para montar a tela — público, porque o visitante escolhe
 * como quer pagar antes de ter conta.
 *
 * Quando vem `subtotal`, a resposta já traz o valor de cada parcela pronto: a
 * conta dos juros é feita aqui, num lugar só, para a tela não reimplementar a
 * regra e mostrar um número diferente do que a venda vai cobrar.
 */
export async function options(req: Request, res: Response) {
  const subtotal = Math.max(Number(req.query.subtotal) || 0, 0);

  try {
    const plans = await listActivePlans();

    const installmentOptions = plans.map((plan) => {
      const totals = computeTotals({ grossTotal: subtotal, discount: 0, interestPercent: plan.interestPercent });

      return {
        installments: plan.installments,
        interestPercent: plan.interestPercent,
        total: totals.finalTotal,
        interest: totals.interest,
        installmentValue: previewInstallmentValue(totals.finalTotal, plan.installments),
      };
    });

    return res.json({
      upfront: { total: subtotal },
      installmentOptions,
    });
  } catch (error) {
    console.error("Erro ao carregar opções de pagamento:", error);
    return res.status(500).json({ error: "Não foi possível carregar as formas de pagamento." });
  }
}

/**
 * Confere um cupom para a tela mostrar o desconto antes do envio.
 *
 * A resposta daqui é informativa: quem decide é a transação da venda, que
 * revalida e consome o uso. Tem limite próprio porque é a única rota pública
 * que responde sobre a existência de um código.
 */
export async function validateCoupon(req: Request, res: Response) {
  const subtotal = Math.max(Number(req.body?.subtotal) || 0, 0);

  try {
    const result = await checkCoupon(prisma, req.body?.code, subtotal);

    if (!result.ok) {
      return res.status(422).json({ valid: false, error: result.message, reason: result.reason });
    }

    return res.json({ valid: true, code: result.code, discount: result.discount });
  } catch (error) {
    console.error("Erro ao validar cupom:", error);
    return res.status(500).json({ error: "Não foi possível conferir o cupom." });
  }
}
