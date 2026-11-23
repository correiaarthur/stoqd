import { useState } from 'react';
import { Link } from 'react-router-dom';

import { createOrder } from '../../services/orders';
import { useCart } from '../../contexts/cart';
import { formatCurrency } from '../../utils/formatters';
import { getApiErrorMessage } from '../../utils/errors';
import { usePaymentOptions, totalsFor } from '../../hooks/usePaymentOptions';
import { PaymentPicker, type PaymentChoice } from '../PaymentPicker';
import type { AppliedCoupon } from '../CouponField';
import { ArrowRightIcon } from './ArrowRightIcon';
import type { PanelBase } from './types';

/** O que o visitante vê: total, e um botão que depende de estar logado. */
export function CustomerPanel({
  itemsTotal, canFinish, blockedReason, isCustomer: logged, coupon, isProcessing, setIsProcessing, error, setError, onOrdered,
}: PanelBase & { isCustomer: boolean; coupon: AppliedCoupon | null; onOrdered: () => void }) {
  const { items, cartToken } = useCart();
  const [observation, setObservation] = useState('');
  const [choice, setChoice] = useState<PaymentChoice>({ paymentType: 'VISTA', installmentsCount: 1 });

  const netTotal = Math.max(itemsTotal - (coupon?.discount ?? 0), 0);
  const { options, loading } = usePaymentOptions(netTotal);
  const installmentOptions = options?.installmentOptions ?? [];

  const totals = totalsFor(netTotal, choice, installmentOptions);

  const sendOrder = async () => {
    setError('');
    setIsProcessing(true);

    try {
      await createOrder({
        cartToken,
        observation: observation.trim() || null,
        paymentType: choice.paymentType,
        installmentsCount: choice.installmentsCount,
        couponCode: coupon?.code ?? null,
        items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
      });

      onOrdered();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível enviar o pedido.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <aside className="checkout-summary checkout-summary-green" aria-label="Pagamento">
      {logged ? (
        <PaymentPicker
          netTotal={netTotal}
          installmentOptions={installmentOptions}
          loading={loading}
          value={choice}
          onChange={setChoice}
        />
      ) : (
        <h2 className="checkout-summary-title">Falta só <em>a conta.</em></h2>
      )}

      <div className="checkout-totals">
        <div className="total-row total-row-sub">
          <span>Subtotal</span>
          <span>{formatCurrency(itemsTotal)}</span>
        </div>

        <div className="total-row total-row-sub total-row-discount">
          <span>{coupon ? `Cupom ${coupon.code}` : 'Desconto'}</span>
          <span>{coupon ? `− ${formatCurrency(coupon.discount)}` : '—'}</span>
        </div>

        {totals.interest > 0 && (
          <div className="total-row total-row-sub total-row-interest">
            <span>Juros do parcelamento ({totals.interestPercent}%)</span>
            <span>+ {formatCurrency(totals.interest)}</span>
          </div>
        )}

        <div className="total-row total-row-final">
          <span className="total-label">Total</span>
          <span className="total-value">{formatCurrency(totals.total)}</span>
        </div>

        {choice.paymentType === 'PRAZO' && (
          <span className="total-installments">
            {choice.installmentsCount}x de {formatCurrency(totals.installmentValue)}
          </span>
        )}
      </div>

      {logged ? (
        <>
          <div className="form-group">
            <label htmlFor="co-obs">Observação (opcional)</label>
            <input
              id="co-obs"
              type="text"
              className="input-standard"
              placeholder="Ex: retiro no sábado"
              value={observation}
              onChange={e => setObservation(e.target.value)}
            />
          </div>

          {error && <div className="checkout-alert">{error}</div>}

          <button type="button" className="checkout-cta" disabled={!canFinish} onClick={sendOrder}>
            {isProcessing ? 'Enviando...' : 'Enviar pedido'}
            <ArrowRightIcon />
          </button>

          {blockedReason && <span className="checkout-blocked">{blockedReason}</span>}

          <p className="checkout-note">
            A loja confirma por telefone antes de separar — inclusive a forma de pagamento.
            Nada é cobrado agora, e o estoque só sai quando a loja confirmar.
          </p>
        </>
      ) : (
        <>
          <p className="checkout-note">
            Para escolher a forma de pagamento, usar cupom e enviar o pedido é preciso ter
            uma conta — é assim que a loja sabe com quem falar para combinar entrega e pagamento.
          </p>
          <Link to="/cadastro?next=/checkout" className="checkout-cta">
            Criar conta
            <ArrowRightIcon />
          </Link>
          <Link to="/login?next=/checkout" className="checkout-cta checkout-cta-ghost">Já tenho conta</Link>
        </>
      )}
    </aside>
  );
}
