import type { Prisma$Tx } from './availability.js';
import { getActivePrice } from './pricing.js';
import { consumeCoupon } from './coupons.js';
import { computeTotals, getInterestPercent, toCents } from './pricingRules.js';

/** Regra de negócio que o operador precisa ler na tela, e não um erro interno. */
export class SaleError extends Error {}

export type SaleItemInput = {
  productId: number;
  quantity: number;
  /**
   * Preço já decidido pelo chamador. Só a confirmação de pedido usa — para
   * cobrar o valor que o cliente viu ao pedir. Nunca deve vir do corpo de uma
   * requisição: aí o comprador escolheria o próprio preço.
   */
  unitPrice?: number;
};

export type RegisterSaleInput = {
  customerId: number | null;
  items: SaleItemInput[];
  /** Desconto manual digitado por quem fecha a venda. */
  discount: number;
  installmentsCount: number;
  paymentType: string;
  observation: string | null;
  /**
   * Cupom já validado pelo chamador. O desconto vem junto porque quem valida
   * conhece o subtotal; aqui ele é apenas somado ao desconto manual e o uso é
   * consumido dentro da mesma transação.
   */
  coupon?: { id: number; discount: number } | null;
};

/**
 * Divisão em centavos: 10,00 em 3x daria 3,3333… e a soma das parcelas não
 * fecharia com o total. O resto vai para as primeiras parcelas — inclusive
 * quando o total já carrega juros, que é justamente quando ele deixa de ser
 * redondo.
 */
export function buildInstallments(finalTotal: number, totalInstallments: number, isPaidUpfront: boolean) {
  const totalCents = Math.round(finalTotal * 100);
  const baseCents = Math.floor(totalCents / totalInstallments);
  const leftoverCents = totalCents - baseCents * totalInstallments;

  const installments = [];

  for (let i = 1; i <= totalInstallments; i++) {
    const dueDate = new Date();
    if (!isPaidUpfront) {
      dueDate.setMonth(dueDate.getMonth() + i);
    }

    installments.push({
      number: i,
      value: (baseCents + (i <= leftoverCents ? 1 : 0)) / 100,
      dueDate,
      paidAt: isPaidUpfront ? new Date() : null,
    });
  }

  return installments;
}

/**
 * Cria a venda, baixa o estoque e gera as parcelas — o único lugar onde isso
 * acontece. A venda de balcão e a confirmação de um pedido da vitrine chegam
 * as duas por aqui.
 *
 * A checagem é contra a quantidade **física** do produto, não contra o
 * disponível. É a decisão D2: quem está com o produto na mão vende. Se havia
 * reserva de outra pessoa sobre aquela unidade, quem perde é o pedido online —
 * que falha na confirmação com mensagem explicando — e não a venda presencial.
 */
export async function registerSale(tx: Prisma$Tx, input: RegisterSaleInput) {
  const isPaidUpfront = input.paymentType !== 'PRAZO';

  if (!isPaidUpfront && !input.customerId) {
    throw new SaleError("Para vender a prazo, selecione um cliente.");
  }

  // À vista é sempre uma parcela só, mesmo que o caixa tenha escolhido um
  // parcelamento antes de voltar para o pagamento à vista.
  const totalInstallments = isPaidUpfront ? 1 : Number(input.installmentsCount) || 1;

  // A taxa vem do banco, nunca do pedido: se o comprador pudesse mandar a
  // taxa, escolheria a própria. Opção desligada não vira 0% em silêncio —
  // recusa, senão desligar um parcelamento viraria um desconto escondido.
  const interestPercent = await getInterestPercent(tx, totalInstallments);

  if (interestPercent === null) {
    throw new SaleError(`O parcelamento em ${totalInstallments}x não está disponível.`);
  }

  let grossTotal = 0;
  const saleItemsData = [];

  for (const item of input.items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });

    if (!product) throw new SaleError(`Produto ID ${item.productId} não encontrado.`);
    if (product.quantity < item.quantity) {
      throw new SaleError(`Estoque insuficiente para ${product.name}. Restam ${product.quantity}.`);
    }

    const unitPrice = item.unitPrice ?? getActivePrice(product);
    grossTotal += unitPrice * item.quantity;

    saleItemsData.push({ productId: product.id, quantity: item.quantity, unitPrice });

    await tx.product.update({
      where: { id: product.id },
      data: { quantity: { decrement: item.quantity } },
    });
  }

  const manualDiscount = toCents(Number(input.discount) || 0);

  if (manualDiscount > grossTotal) {
    throw new SaleError("O desconto não pode ser maior que o valor total da venda.");
  }

  let couponDiscount = 0;

  if (input.coupon) {
    // Última chance de recusar: entre a validação na tela e este ponto o cupom
    // pode ter vencido, esgotado ou sido desativado.
    const consumed = await consumeCoupon(tx, input.coupon.id);

    if (!consumed) {
      throw new SaleError("O cupom não está mais disponível. Remova-o para fechar a venda.");
    }

    couponDiscount = toCents(input.coupon.discount);
  }

  const totals = computeTotals({
    grossTotal,
    discount: manualDiscount + couponDiscount,
    interestPercent,
  });

  return tx.sale.create({
    data: {
      total: totals.finalTotal,
      discount: totals.discount,
      interest: totals.interest,
      couponId: input.coupon?.id ?? null,
      customerId: input.customerId,
      observation: input.observation,
      items: { create: saleItemsData },
      installments: { create: buildInstallments(totals.finalTotal, totalInstallments, isPaidUpfront) },
    },
    include: { items: true, installments: true },
  });
}
