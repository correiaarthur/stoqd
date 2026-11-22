import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createOrder, createSale } from '../services/orders';
import { useCart } from '../contexts/cart';
import { useCustomers } from '../hooks/useCustomers';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { formatCurrency, parseCurrencyInput, parsePercentInput } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import { isAdmin, isCustomer } from '../utils/auth';
import { CustomerModal } from '../components/CustomerModal';
import { CouponField, type AppliedCoupon } from '../components/CouponField';
import { PaymentPicker, type PaymentChoice } from '../components/PaymentPicker';
import { usePaymentOptions, totalsFor } from '../hooks/usePaymentOptions';
import { LazyImage } from '../components/LazyImage';
import './Checkout.css';

/**
 * Uma página, dois comportamentos.
 *
 * O **cliente logado** finaliza e cria um pedido pendente, que espera a
 * confirmação da loja. O **admin** finaliza e cria a venda direto, pelo mesmo
 * `POST /sales` de sempre — é a venda de balcão de antes, agora aqui.
 *
 * Mesmo carrinho, mesma reserva. O que muda é quem enxerga o bloco de cliente,
 * desconto e parcelamento, e para onde o botão de finalizar aponta.
 */
export function Checkout() {
  const navigate = useNavigate();
  const {
    items, total, expiresAt, reservationMinutes, availability,
    setQuantity, removeItem, clear, refreshAvailability,
  } = useCart();

  const admin = isAdmin();
  const customer = isCustomer();

  const [isProcessing, setIsProcessing] = useState(false);
  // O cupom do visitante mora na coluna dos produtos e mexe no total do resumo.
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const secondsLeft = useCountdown(expiresAt);

  // Ao entrar no checkout o servidor responde a disponibilidade de agora: é o
  // caso do carrinho que sobreviveu no navegador enquanto a reserva vencia.
  //
  // Os itens já estão na tela (vêm do navegador); o que ainda não se sabe é o
  // estoque de cada um. Enquanto essa resposta não chega, só o lugar dela vira
  // esqueleto — esconder a sacola inteira seria esconder o que já se sabe.
  const checkedOnMount = useRef(false);
  const [checkingStock, setCheckingStock] = useState(items.length > 0);
  useEffect(() => {
    if (checkedOnMount.current) return;
    checkedOnMount.current = true;
    Promise.resolve(refreshAvailability()).finally(() => setCheckingStock(false));
  }, [refreshAvailability]);

  // O que barra o admin não é o que barra o visitante. Quem está com o produto
  // na mão vende (decisão D2): para o balcão só o estoque físico impede, e a
  // reserva de alguém do site vira aviso, não bloqueio.
  const sellableFor = useMemo(() => (productId: number) => {
    const status = availability[productId];
    if (!status) return null;

    return admin ? status.quantity : status.available;
  }, [availability, admin]);

  const blockingItems = useMemo(() => items.filter(item => {
    const left = sellableFor(item.productId);
    return left !== null && left < item.quantity;
  }), [items, sellableFor]);

  /** Resolve todos de uma vez: ajusta o que sobrou, remove o que esgotou. */
  const fixAllBlocking = () => {
    for (const item of blockingItems) {
      setQuantity(item.productId, sellableFor(item.productId) ?? 0);
    }
  };

  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const canFinish = items.length > 0 && blockingItems.length === 0 && !isProcessing;

  const blockedReason = blockingItems.length === 0
    ? null
    : blockingItems.length === 1
      ? 'Resolva o item marcado para liberar o envio.'
      : `Resolva os ${blockingItems.length} itens marcados para liberar o envio.`;

  return (
    <div className="page-container checkout-page">
      <Link to="/" className="checkout-back">← Continuar escolhendo</Link>

      <div className="checkout-head">
        <div className="checkout-head-text">
          <span className="checkout-kicker">
            {items.length === 0
              ? (admin ? 'Balcão' : 'Sacola')
              : `${admin ? 'Balcão' : 'Sacola'} · ${items.length} ${items.length === 1 ? 'produto' : 'produtos'}, ${unitCount} ${unitCount === 1 ? 'unidade' : 'unidades'}`}
          </span>
          <h1 className="checkout-title">
            {admin ? <>Fechar <em>venda.</em></> : <>Seu pedido, <em>reservado.</em></>}
          </h1>
        </div>
        {items.length > 0 && secondsLeft !== null && !admin && (
          <ReservationTimer secondsLeft={secondsLeft} totalMinutes={reservationMinutes} />
        )}
      </div>

      {items.length === 0 ? (
        <div className="base-card checkout-empty">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="checkout-empty-icon">
            <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>

          <div className="checkout-empty-text">
            <h2>Seu carrinho está vazio</h2>
            <p>
              {admin
                ? 'Escolha os produtos na vitrine para montar a venda.'
                : 'Escolha o que quiser na vitrine — o estoque fica reservado para você por 5 minutos assim que o primeiro item entrar aqui.'}
            </p>
          </div>

          <Link to="/" className="btn-primary">Ver a vitrine</Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="checkout-main">
          <section className="checkout-items" aria-label="Produtos da sacola">
            {checkingStock && (
              <p className="stock-checking" role="status">Conferindo o estoque de cada item…</p>
            )}

            {items.map(item => {
              const status = availability[item.productId];
              const left = sellableFor(item.productId);
              const short = left !== null && left < item.quantity;
              const soldOut = short && left === 0;
              const reservedElsewhere = admin && status ? status.reserved : 0;

              return (
                <div key={item.productId} className={`checkout-item ${short ? 'short' : ''} ${soldOut ? 'sold-out' : ''}`}>
                  <div className="checkout-item-image">
                    {item.imageUrl
                      ? (
                        <div className="checkout-item-photo skeleton">
                          <LazyImage src={item.imageUrl} alt={`Imagem de ${item.name}`} />
                        </div>
                      )
                      : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="checkout-item-placeholder">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                      )}
                  </div>

                  <div className="checkout-item-main">
                    <div className="checkout-item-top">
                      <h3>{item.name}</h3>
                      <strong className="checkout-item-subtotal">{formatCurrency(item.unitPrice * item.quantity)}</strong>
                    </div>

                    <div className="checkout-item-controls">
                      <div className="qty-controls">
                        <button type="button" aria-label="Diminuir quantidade" onClick={() => setQuantity(item.productId, item.quantity - 1)}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label="Aumentar quantidade" onClick={() => setQuantity(item.productId, item.quantity + 1)}>+</button>
                      </div>
                      {item.quantity > 1 && (
                        <span className="checkout-item-price">{formatCurrency(item.unitPrice)} cada</span>
                      )}
                      <button type="button" className="btn-remove" aria-label={`Remover ${item.name}`} title="Remover" onClick={() => removeItem(item.productId)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>

                    {checkingStock && !status && (
                      <span className="skeleton skeleton-line checkout-item-skeleton" aria-hidden="true" />
                    )}

                    {short && (
                      <span className="checkout-item-warning">
                        {soldOut ? 'Esgotado' : `Restam ${left} das ${item.quantity} unidades`}
                        <button
                          type="button"
                          className="checkout-item-fix"
                          onClick={() => (soldOut ? removeItem(item.productId) : setQuantity(item.productId, left!))}
                        >
                          {soldOut ? 'remover da sacola' : `ajustar para ${left}`}
                        </button>
                      </span>
                    )}

                    {/* Aviso do balcão: alguém no site reservou, mas a venda
                        presencial continua liberada. */}
                    {reservedElsewhere > 0 && !short && (
                      <span className="checkout-item-reserved">
                        {status!.quantity} un · {reservedElsewhere} reservada(s) no site
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {blockingItems.length > 0 && (
            <aside className="stock-alert" role="alert">
              <p className="stock-alert-text">
                <strong>
                  {secondsLeft === 0 && !admin ? 'Sua reserva venceu e o estoque ' : 'O estoque '}
                  {blockingItems.length === 1 ? 'de um item mudou.' : `de ${blockingItems.length} itens mudou.`}
                </strong>{' '}
                Os itens continuam na sacola. Ajuste ou remova os marcados para continuar.
              </p>
              <button type="button" className="stock-alert-fix" onClick={fixAllBlocking}>
                Ajustar tudo
              </button>
            </aside>
          )}

          {!admin && customer && (
            <div className="checkout-coupon">
              <CouponField variant="line" subtotal={total} applied={coupon} onChange={setCoupon} />
            </div>
          )}
          </div>

          {admin ? (
            <AdminPanel
              itemsTotal={total}
              canFinish={canFinish}
              blockedReason={blockedReason}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
              error={error}
              setError={setError}
              success={success}
              setSuccess={setSuccess}
              onDone={clear}
            />
          ) : (
            <CustomerPanel
              itemsTotal={total}
              canFinish={canFinish}
              blockedReason={blockedReason}
              isCustomer={customer}
              coupon={coupon}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
              error={error}
              setError={setError}
              onOrdered={() => {
                clear();
                navigate('/minha-conta?pedido=enviado');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O relógio da reserva, com a barra esvaziando.
 *
 * Um número contando para trás é uma informação que se lê; a barra encolhendo é
 * uma que se vê de canto de olho — e é esse o ponto, já que a pessoa está
 * olhando para os produtos, não para o relógio.
 */
function ReservationTimer({ secondsLeft, totalMinutes }: { secondsLeft: number; totalMinutes: number | null }) {
  const expired = secondsLeft === 0;

  // Sem saber a duração total não dá para desenhar proporção: a barra some e
  // fica só o número, em vez de mostrar uma fração inventada.
  const percent = totalMinutes
    ? Math.min(100, Math.max(0, (secondsLeft / (totalMinutes * 60)) * 100))
    : null;

  return (
    <div className={`reservation-timer ${expired ? 'expired' : ''}`} role="timer">
      <span className="reservation-timer-text">
        {expired ? 'Reserva vencida' : 'Reservado por mais'}
      </span>
      <span className="reservation-timer-clock">{expired ? '00:00' : formatCountdown(secondsLeft)}</span>

      {percent !== null && !expired && (
        <div className="reservation-timer-track" aria-hidden="true">
          <div className="reservation-timer-fill" style={{ width: `${percent}%` }}></div>
        </div>
      )}
    </div>
  );
}

type PanelBase = {
  itemsTotal: number;
  canFinish: boolean;
  /** Por que o botão está travado. Null quando dá para finalizar. */
  blockedReason: string | null;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
};

/** O que o visitante vê: total, e um botão que depende de estar logado. */
function CustomerPanel({
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </Link>
          <Link to="/login?next=/checkout" className="checkout-cta checkout-cta-ghost">Já tenho conta</Link>
        </>
      )}
    </aside>
  );
}

/**
 * O bloco que era do PDV: cliente, desconto, forma de pagamento e parcelas.
 * Só o admin vê, e ele fecha a venda direto — sem pedido, sem espera.
 */
function AdminPanel({
  itemsTotal, canFinish, blockedReason, isProcessing, setIsProcessing, error, setError, success, setSuccess, onDone,
}: PanelBase & { success: string; setSuccess: (value: string) => void; onDone: () => void }) {
  const { items } = useCart();
  const { customers, setCustomers } = useCustomers();

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [observation, setObservation] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [choice, setChoice] = useState<PaymentChoice>({ paymentType: 'VISTA', installmentsCount: 1 });

  const typedDiscount = Number(discountInput) || 0;

  const rawDiscountInReais = discountType === 'percentage'
    ? itemsTotal * (typedDiscount / 100)
    : typedDiscount;

  // No balcão o desconto é o que a pessoa digita (em R$ ou %); o cupom é coisa
  // da sacola do visitante. O total nunca fica negativo — mesma regra do
  // servidor, repetida aqui só para a tela não prometer outro número.
  const finalDiscountInReais = Math.min(rawDiscountInReais, itemsTotal);
  const netTotal = itemsTotal - finalDiscountInReais;

  const { options, loading: loadingPayment } = usePaymentOptions(netTotal);
  const installmentOptions = options?.installmentOptions ?? [];
  const totals = totalsFor(netTotal, choice, installmentOptions);
  const finalTotal = totals.total;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fiado sem cliente não existe: o backend recusa, e a tela não deve nem chegar lá.
  useEffect(() => {
    if (!selectedCustomer && choice.paymentType === 'PRAZO') {
      setChoice({ paymentType: 'VISTA', installmentsCount: 1 });
    }
  }, [selectedCustomer, choice.paymentType]);

  const selectCustomer = (id: string, name: string) => {
    setSelectedCustomer(id);
    setCustomerSearchText(name);
    setIsDropdownOpen(false);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearchText.toLowerCase())
  );

  const registerSale = async () => {
    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const res = await createSale({
        customerId: selectedCustomer ? Number(selectedCustomer) : null,
        observation: observation.trim() || null,
        discount: Math.min(rawDiscountInReais, itemsTotal),
        installmentsCount: choice.installmentsCount,
        paymentType: choice.paymentType,
        items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
      });

      setSuccess(`Venda #${res.data.id} registrada.`);
      onDone();
      setSelectedCustomer('');
      setCustomerSearchText('');
      setObservation('');
      setDiscountInput('');
      setDiscountType('fixed');
      setChoice({ paymentType: 'VISTA', installmentsCount: 1 });
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

      <div className="checkout-customer">
        <div className="custom-select-wrapper" ref={dropdownRef}>
          <svg className="select-icon user-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
          </svg>

          <input
            type="text"
            className="checkout-customer-select"
            placeholder="Consumidor final"
            value={customerSearchText}
            onChange={e => {
              setCustomerSearchText(e.target.value);
              setIsDropdownOpen(true);
              if (selectedCustomer) setSelectedCustomer('');
            }}
            onFocus={() => setIsDropdownOpen(true)}
          />

          {customerSearchText ? (
            <svg className="select-icon chevron-icon clear-icon" onClick={() => selectCustomer('', '')} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg className="select-icon chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}

          {isDropdownOpen && (
            <div className="customer-dropdown-menu">
              <div className="customer-dropdown-item special-item" onClick={() => selectCustomer('', '')}>
                Consumidor final
              </div>
              {filteredCustomers.map(c => (
                <div key={c.id} className="customer-dropdown-item" onClick={() => selectCustomer(String(c.id), c.name)}>
                  {c.name} <span className="customer-phone-dropdown">{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="btn-new-customer" onClick={() => setIsCustomerModalOpen(true)}>+ Novo</button>
      </div>

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

      <div className="form-group">
        <label className="sr-only">Desconto</label>
        <div className="checkout-discount-group">
          <div className="checkout-discount-toggle">
            <button
              type="button"
              className={`checkout-toggle-btn ${discountType === 'fixed' ? 'active' : ''}`}
              onClick={() => { setDiscountType('fixed'); setDiscountInput(''); }}
            >R$</button>
            <button
              type="button"
              className={`checkout-toggle-btn ${discountType === 'percentage' ? 'active' : ''}`}
              onClick={() => { setDiscountType('percentage'); setDiscountInput(''); }}
            >%</button>
          </div>
          <input
            type="text"
            className="input-standard"
            placeholder={discountType === 'percentage' ? '0' : '0.00'}
            value={discountInput}
            onChange={e => setDiscountInput(
              discountType === 'percentage' ? parsePercentInput(e.target.value) : parseCurrencyInput(e.target.value)
            )}
          />
        </div>
      </div>

      <PaymentPicker
        netTotal={netTotal}
        installmentOptions={installmentOptions}
        loading={loadingPayment}
        value={choice}
        onChange={setChoice}
        variant="admin"
        {...(selectedCustomer ? {} : { installmentsDisabledReason: 'Para vender a prazo, selecione um cliente.' })}
      />

      </div>

      <div className="checkout-block">
        <span className="checkout-block-title">Resumo</span>

      <div className="checkout-totals">
        <div className="total-row total-row-sub">
          <span>Produtos</span><span>{formatCurrency(itemsTotal)}</span>
        </div>

        {rawDiscountInReais > 0 && (
          <div className="total-row total-row-discount">
            <span>Desconto</span>
            <span>− {formatCurrency(Math.min(rawDiscountInReais, itemsTotal))}</span>
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
          <span className="total-value">{formatCurrency(finalTotal)}</span>
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
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
              selectCustomer(String(newCustomer.id), newCustomer.name);
            }
          }}
        />
      )}
    </aside>
  );
}
