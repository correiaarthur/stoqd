import { DomainError } from './errors.js';
import type { Prisma$Tx } from './availability.js';
import { getActivePrice } from './pricing.js';
import { consumeCoupon } from './coupons.js';
import { computeTotals, getInterestPercent, parseInstallmentsCount, sumLines, toCents } from './pricingRules.js';

/** Regra de negócio da venda que o operador precisa ler na tela (400). */
export class SaleError extends DomainError {}

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
  //
  // A prazo, a quantidade é conferida aqui também, por mais que o chamador já
  // tenha validado: 0, negativo ou fracionário geraria uma venda sem parcelas.
  const totalInstallments = isPaidUpfront ? 1 : parseInstallmentsCount(input.installmentsCount);

  if (totalInstallments === null) {
    throw new SaleError("O parcelamento precisa ser de 1x a 12x.");
  }

  // A taxa vem do banco, nunca do pedido: se o comprador pudesse mandar a
  // taxa, escolheria a própria. Opção desligada não vira 0% em silêncio —
  // recusa, senão desligar um parcelamento viraria um desconto escondido.
  const interestPercent = await getInterestPercent(tx, totalInstallments);

  if (interestPercent === null) {
    throw new SaleError(`O parcelamento em ${totalInstallments}x não está disponível.`);
  }

  const saleItemsData = [];

  for (const item of input.items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });

    if (!product) throw new SaleError(`Produto ID ${item.productId} não encontrado.`);

    saleItemsData.push({
      productId: product.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? getActivePrice(product),
    });

    // Checar e escrever são a **mesma** operação, de propósito.
    //
    // A versão anterior lia a quantidade, comparava, e só então decrementava.
    // Entre a leitura e a escrita cabia outra transação fazendo o mesmo: as duas
    // viam "1 disponível", as duas passavam, e o estoque terminava negativo —
    // produto vendido duas vezes, uma pessoa sem receber. Medido: cinco vendas
    // simultâneas da última unidade deixavam o estoque em −2.
    //
    // Com a condição dentro do UPDATE, o Postgres tranca a linha e reavalia o
    // `quantity >= n` depois de a transação anterior commitar. A segunda não
    // encontra linha para afetar e `count` vem 0. É o mesmo padrão de
    // `consumeCoupon`, pela mesma razão.
    const { count } = await tx.product.updateMany({
      where: { id: product.id, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });

    if (count !== 1) {
      // A quantidade da leitura acima já está velha neste ponto; quem perdeu a
      // corrida precisa ver o número de agora, não o de antes.
      const atual = await tx.product.findUnique({
        where: { id: product.id },
        select: { quantity: true },
      });

      throw new SaleError(
        `Estoque insuficiente para ${product.name}. Restam ${atual?.quantity ?? 0}.`
      );
    }
  }

  // Somado depois do laço, e não acumulado dentro dele, para a conta do bruto
  // ser a mesma função que o resto do sistema usa. A ordem das somas é a ordem
  // dos itens nos dois casos, o que importa porque o total é Float e soma de
  // Float não é associativa: trocar a ordem trocaria o centavo.
  const grossTotal = sumLines(saleItemsData);

  const manualDiscount = toCents(Number(input.discount) || 0);

  // Desconto negativo viraria acréscimo fora do fluxo de juros.
  if (manualDiscount < 0) {
    throw new SaleError("O desconto não pode ser negativo.");
  }

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
