import { useEffect, useState } from 'react';

import { createSale } from '../../services/orders';
import { useCart } from '../../contexts/cart';
import { useCustomers } from '../../hooks/useCustomers';
import { useCustomerPicker } from '../../hooks/useCustomerPicker';
import { useDiscountInput } from '../../hooks/useDiscountInput';
import { usePaymentOptions, totalsFor } from '../../hooks/usePaymentOptions';
import { formatCurrency } from '../../utils/formatters';
import { getApiErrorMessage } from '../../utils/errors';
import { CustomerModal } from '../CustomerModal';
import { PaymentPicker, type PaymentChoice } from '../PaymentPicker';
import { ArrowRightIcon } from './ArrowRightIcon';
import { CustomerPicker } from './CustomerPicker';
import { DiscountField } from './DiscountField';
import type { PanelBase } from './types';

const CASH: PaymentChoice = { paymentType: 'VISTA', installmentsCount: 1 };

/**
 * O bloco que era do PDV: cliente, desconto, forma de pagamento e parcelas.
 * Só o admin vê, e ele fecha a venda direto — sem pedido, sem espera.
 */
export function AdminPanel({
  itemsTotal, canFinish, blockedReason, isProcessing, setIsProcessing, error, setError, success, setSuccess, onDone,
}: PanelBase & { success: string; setSuccess: (value: string) => void; onDone: () => void }) {
  const { items } = useCart();
  const { customers, setCustomers } = useCustomers();
  const picker = useCustomerPicker(customers);
  const discount = useDiscountInput(itemsTotal);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [observation, setObservation] = useState('');
  const [choice, setChoice] = useState<PaymentChoice>(CASH);

  // No balcão o desconto é o que a pessoa digita (em R$ ou %); o cupom é coisa
  // da sacola do visitante. O total nunca fica negativo.
  const netTotal = itemsTotal - discount.inReais;

  const { options, loading: loadingPayment } = usePaymentOptions(netTotal);
  const installmentOptions = options?.installmentOptions ?? [];
  const totals = totalsFor(netTotal, choice, installmentOptions);

  // Fiado sem cliente não existe: o backend recusa, e a tela não deve nem chegar lá.
  useEffect(() => {
    if (!picker.selectedId && choice.paymentType === 'PRAZO') {
      setChoice(CASH);
    }
  }, [picker.selectedId, choice.paymentType]);

  const registerSale = async () => {
    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const res = await createSale({
        customerId: picker.selectedId ? Number(picker.selectedId) : null,
        observation: observation.trim() || null,
        discount: discount.inReais,
        installmentsCount: choice.installmentsCount,
        paymentType: choice.paymentType,
        items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
      });

      setSuccess(`Venda #${res.data.id} registrada.`);
      onDone();
      picker.reset();
      setObservation('');
      discount.reset();
      setChoice(CASH);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao registrar venda.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <aside className="checkout-summary checkout-summary-green checkout-summary-blocks">

      <div className="checkout-block">
        <span className="checkout-block-title">Cliente</span>

        <CustomerPicker picker={picker} onNew={() => setIsCustomerModalOpen(true)} />

        <div className="form-group checkout-block-obs">
          <label>Observação (opcional)</label>
          <input
            type="text"
            className="input-standard"
            placeholder="Adicione aqui uma anotação! ;)"
            value={observation}
            onChange={e => setObservation(e.target.value)}
          />
        </div>
      </div>

      <div className="checkout-block">
        <span className="checkout-block-title">Desconto e pagamento</span>

        <DiscountField discount={discount} />

        <PaymentPicker
          netTotal={netTotal}
          installmentOptions={installmentOptions}
          loading={loadingPayment}
          value={choice}
          onChange={setChoice}
          variant="admin"
          {...(picker.selectedId ? {} : { installmentsDisabledReason: 'Para vender a prazo, selecione um cliente.' })}
        />
      </div>

      <div className="checkout-block">
        <span className="checkout-block-title">Resumo</span>

        <div className="checkout-totals">
          <div className="total-row total-row-sub">
            <span>Produtos</span><span>{formatCurrency(itemsTotal)}</span>
          </div>

          {discount.rawInReais > 0 && (
            <div className="total-row total-row-discount">
              <span>Desconto</span>
              <span>− {formatCurrency(discount.inReais)}</span>
            </div>
          )}

          {totals.interest > 0 && (
            <div className="total-row total-row-interest">
              <span>Juros ({totals.interestPercent}%)</span>
              <span>+ {formatCurrency(totals.interest)}</span>
            </div>
          )}

          <div className="total-row">
            <span className="total-label">Total a pagar</span>
            <span className="total-value">{formatCurrency(totals.total)}</span>
          </div>

          {choice.paymentType === 'PRAZO' && (
            <span className="total-installments">
              {choice.installmentsCount}x de {formatCurrency(totals.installmentValue)}
            </span>
          )}
        </div>

        {error && <div className="checkout-alert">{error}</div>}
        {success && <div className="checkout-success">{success}</div>}

        <button type="button" className="checkout-cta" disabled={!canFinish} onClick={registerSale}>
          {isProcessing ? 'Processando...' : 'Registrar venda'}
          <ArrowRightIcon />
        </button>

        {blockedReason && <span className="checkout-blocked">{blockedReason}</span>}
      </div>

      {isCustomerModalOpen && (
        <CustomerModal
          onClose={() => setIsCustomerModalOpen(false)}
          onSuccess={(newCustomer) => {
            if (newCustomer) {
              // O POST devolve só a linha criada; o resumo de dívida é
              // calculado pelo GET da listagem. Para quem acabou de ser
              // cadastrado ele é zerado — e sem preencher aqui, a lista
              // ficaria com `totalDebt` indefinido até o próximo refetch.
              setCustomers([
                ...customers,
                { ...newCustomer, totalDebt: 0, pendingSalesCount: 0, hasOverdue: false },
              ]);
              picker.select(String(newCustomer.id), newCustomer.name);
            }
          }}
        />
      )}
    </aside>
  );
}
