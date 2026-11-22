import { useState } from 'react';

import { confirmOrder, cancelOrder } from '../services/orders';
import { usePendingOrders, type PendingOrder } from '../hooks/usePendingOrders';
import { useCustomers } from '../hooks/useCustomers';
import { formatCurrency, parseCurrencyInput } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import './PendingOrders.css';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Pedidos da vitrine esperando resposta.
 *
 * Confirmar aqui faz três coisas de uma vez: vincula (ou cria) o cliente,
 * revalida o estoque e cria a venda. A recusa pede um motivo — é o que o
 * cliente vai ler no lugar de um pedido que sumiu.
 */
export function PendingOrders({ onConfirmed }: { onConfirmed: () => void }) {
  const { orders, loading, refetch } = usePendingOrders();

  // A lista de clientes é a mesma para todos os cards: buscar aqui em cima
  // evita uma chamada por pedido na tela.
  const { customers } = useCustomers();

  if (loading) return null;
  if (orders.length === 0) return null;

  return (
    <section className="page-card base-card pending-orders">
      <header className="pending-orders-head">
        <h2>Pedidos aguardando confirmação</h2>
        <span className="badge badge-pending">{orders.length}</span>
      </header>

      <div className="pending-order-list">
        {orders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            customers={customers}
            onDone={() => { refetch(); onConfirmed(); }}
          />
        ))}
      </div>
    </section>
  );
}

type CustomerOption = { id: number; name: string };

function OrderCard({ order, customers, onDone }: {
  order: PendingOrder;
  customers: CustomerOption[];
  onDone: () => void;
}) {
  const [customerChoice, setCustomerChoice] = useState<string>(
    order.user.customer ? String(order.user.customer.id)
      : order.suggestedCustomers[0] ? String(order.suggestedCustomers[0].id)
      : 'new'
  );
  const [priceSource, setPriceSource] = useState<'order' | 'current'>('order');
  const [discountInput, setDiscountInput] = useState('');

  // A tela abre com o que o cliente pediu já preenchido — e deixa mudar.
  const [paymentType, setPaymentType] = useState<'VISTA' | 'PRAZO'>(order.requested.paymentType);
  const [installmentsCount, setInstallmentsCount] = useState(order.requested.installmentsCount);
  const [keepCoupon, setKeepCoupon] = useState(true);
  const [isRefusing, setIsRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const hasPriceChange = order.items.some(item => item.priceChanged);

  const subtotal = order.items.reduce(
    (acc, item) => acc + (priceSource === 'order' ? item.unitPrice : item.currentPrice) * item.quantity,
    0
  );

  // O cupom é percentual ou fixo; o valor exato quem recalcula é o servidor na
  // confirmação. Aqui usamos o que ele já devolveu para a tela não mentir.
  const couponDiscount = keepCoupon && order.requested.coupon ? order.requested.coupon.discount : 0;
  const manualDiscount = Number(discountInput) || 0;
  const discount = Math.min(manualDiscount + couponDiscount, subtotal);

  const netTotal = subtotal - discount;
  const interestPercent = paymentType === 'PRAZO' ? order.requested.interestPercent ?? 0 : 0;
  const interest = Math.round(netTotal * (interestPercent / 100) * 100) / 100;
  const finalTotal = netTotal + interest;

  const planUnavailable = paymentType === 'PRAZO'
    && installmentsCount > 1
    && order.requested.interestPercent === null;

  const confirm = async () => {
    setError('');
    setIsProcessing(true);

    try {
      await confirmOrder(order.id, {
        ...(customerChoice === 'new' ? { createCustomer: true } : { customerId: Number(customerChoice) }),
        priceSource,
        discount: manualDiscount,
        keepCoupon,
        paymentType,
        installmentsCount,
      });

      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível confirmar o pedido.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const refuse = async () => {
    setError('');
    setIsProcessing(true);

    try {
      await cancelOrder(order.id, reason);
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível recusar o pedido.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <article className="pending-order">
      <header className="pending-order-header">
        <div>
          <strong>Pedido #{order.id}</strong>
          <span className="pending-order-meta">{formatDateTime(order.createdAt)}</span>
        </div>
        <span className="pending-order-total">{formatCurrency(finalTotal)}</span>
      </header>

      <div className="pending-order-contact">
        <span>{order.user.name}</span>
        <a href={`tel:${order.user.phone}`}>{order.user.phone}</a>
        {/* Conta sem e-mail não vira um mailto vazio: o telefone é o canal, e
            o e-mail só aparece quando existe. */}
        {order.user.email && <a href={`mailto:${order.user.email}`}>{order.user.email}</a>}
      </div>

      {order.observation && <p className="pending-order-note">“{order.observation}”</p>}

      <table className="pending-order-items">
        <thead>
          <tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Estoque</th></tr>
        </thead>
        <tbody>
          {order.items.map(item => (
            <tr key={item.productId} className={item.hasStock ? '' : 'no-stock'}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>
                {formatCurrency(priceSource === 'order' ? item.unitPrice : item.currentPrice)}
                {item.priceChanged && (
                  <span className="price-changed">
                    {priceSource === 'order'
                      ? `hoje ${formatCurrency(item.currentPrice)}`
                      : `no pedido ${formatCurrency(item.unitPrice)}`}
                  </span>
                )}
              </td>
              <td>
                {item.quantityInStock} un
                {item.quantityInStock !== item.available && (
                  <span className="stock-reserved"> · {item.quantityInStock - item.available} reservada(s)</span>
                )}
                {!item.hasStock && <span className="stock-missing"> · insuficiente</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pending-order-requested">
        <span className="pending-order-label">O cliente pediu</span>
        <div className="pending-order-requested-body">
          <span>
            {order.requested.paymentType === 'PRAZO'
              ? `${order.requested.installmentsCount}x de ${formatCurrency(order.requested.installmentValue)}`
              : 'Pagamento à vista'}
            {order.requested.interestPercent
              ? ` · juros de ${order.requested.interestPercent}%`
              : ''}
          </span>
          {order.requested.coupon && (
            <span className="pending-order-coupon">
              cupom {order.requested.coupon.code} (− {formatCurrency(order.requested.coupon.discount)})
            </span>
          )}
        </div>
      </div>

      {planUnavailable && (
        <div className="pending-order-alert">
          O parcelamento em {installmentsCount}x foi desligado depois deste pedido. Escolha outra
          forma de pagamento antes de confirmar.
        </div>
      )}

      {!order.hasStockForAll && (
        <div className="pending-order-alert">
          Um item deste pedido não tem mais estoque — provavelmente saiu no balcão.
          Confirmar vai falhar dizendo qual. Recuse explicando o motivo.
        </div>
      )}

      {/* O preço cobrado é decidido aqui, não no pedido. Se mudou no intervalo,
          os dois aparecem e a escolha é sua — senão o cliente vê um valor e
          paga outro. */}
      {hasPriceChange && (
        <div className="pending-order-price-choice">
          <span className="pending-order-label">O preço mudou desde o pedido. Cobrar:</span>
          <div className="pending-order-toggle">
            <button
              type="button"
              className={priceSource === 'order' ? 'active' : ''}
              onClick={() => setPriceSource('order')}
            >o preço do pedido</button>
            <button
              type="button"
              className={priceSource === 'current' ? 'active' : ''}
              onClick={() => setPriceSource('current')}
            >o preço de hoje</button>
          </div>
        </div>
      )}

      {isRefusing ? (
        <div className="pending-order-refuse">
          <label className="pending-order-label">Motivo da recusa (o cliente vai ler)</label>
          <input
            type="text"
            className="input-standard"
            placeholder="Ex: o último frasco saiu no balcão hoje de manhã."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          {error && <div className="pending-order-alert">{error}</div>}
          <div className="pending-order-actions">
            <button className="btn-secondary" onClick={() => setIsRefusing(false)} disabled={isProcessing}>
              Voltar
            </button>
            <button className="btn-danger" onClick={refuse} disabled={isProcessing || reason.trim().length < 3}>
              {isProcessing ? 'Recusando...' : 'Recusar pedido'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pending-order-form">
            <div className="form-group">
              <label>Cliente da venda</label>
              <select className="input-standard" value={customerChoice} onChange={e => setCustomerChoice(e.target.value)}>
                {order.user.customer ? (
                  <option value={order.user.customer.id}>{order.user.customer.name} (já vinculado)</option>
                ) : (
                  <>
                    {order.suggestedCustomers.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>
                        É a {candidate.name} que compra no balcão?
                      </option>
                    ))}
                    <option value="new">Criar cliente com os dados do pedido</option>
                    <optgroup label="Vincular a um cliente existente">
                      {customers
                        .filter(c => !order.suggestedCustomers.some(s => s.id === c.id))
                        .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Desconto extra (R$)</label>
              <input
                type="text"
                className="input-standard"
                placeholder="0.00"
                value={discountInput}
                onChange={e => setDiscountInput(parseCurrencyInput(e.target.value))}
              />
            </div>

            {order.requested.coupon && (
              <div className="form-group">
                <label>Cupom {order.requested.coupon.code}</label>
                <label className="pending-order-check">
                  <input type="checkbox" checked={keepCoupon} onChange={e => setKeepCoupon(e.target.checked)} />
                  <span>Aplicar (− {formatCurrency(order.requested.coupon.discount)})</span>
                </label>
              </div>
            )}

            <div className="form-group">
              <label>Pagamento</label>
              <select className="input-standard" value={paymentType} onChange={e => setPaymentType(e.target.value as 'VISTA' | 'PRAZO')}>
                <option value="VISTA">💳 À vista</option>
                <option value="PRAZO">📝 A prazo (fiado)</option>
              </select>
            </div>

            {paymentType === 'PRAZO' && (
              <div className="form-group">
                <label>Parcelas</label>
                <select className="input-standard" value={installmentsCount} onChange={e => setInstallmentsCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map(num => (
                    <option key={num} value={num}>
                      {num}x{num === order.requested.installmentsCount ? ' (o que ele pediu)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group pending-order-breakdown">
              <label>Conta</label>
              <div className="pending-order-lines">
                <span>Produtos <b>{formatCurrency(subtotal)}</b></span>
                {discount > 0 && <span className="is-discount">Desconto <b>− {formatCurrency(discount)}</b></span>}
                {interest > 0 && <span className="is-interest">Juros ({interestPercent}%) <b>+ {formatCurrency(interest)}</b></span>}
                {paymentType === 'PRAZO' && installmentsCount > 1 && (
                  <span>{installmentsCount}x de <b>{formatCurrency(finalTotal / installmentsCount)}</b></span>
                )}
              </div>
            </div>
          </div>

          {error && <div className="pending-order-alert">{error}</div>}

          <div className="pending-order-actions">
            <button className="btn-secondary" onClick={() => setIsRefusing(true)} disabled={isProcessing}>
              Recusar
            </button>
            <button className="btn-primary" onClick={confirm} disabled={isProcessing || planUnavailable}>
              {isProcessing ? 'Confirmando...' : `Confirmar e registrar ${formatCurrency(finalTotal)}`}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
