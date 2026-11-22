import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useCart } from '../contexts/cart';
import { useCountdown } from '../hooks/useCountdown';
import { useBagStock } from '../hooks/useBagStock';
import { isAdmin, isCustomer } from '../utils/auth';
import { CouponField, type AppliedCoupon } from '../components/CouponField';
import { AdminPanel } from '../components/checkout/AdminPanel';
import { BagItem } from '../components/checkout/BagItem';
import { CheckoutHead } from '../components/checkout/CheckoutHead';
import { CustomerPanel } from '../components/checkout/CustomerPanel';
import { EmptyBag } from '../components/checkout/EmptyBag';
import { StockAlert } from '../components/checkout/StockAlert';
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
 *
 * A página só monta: o estoque da sacola está em `useBagStock` e cada pedaço da
 * tela em `components/checkout/`.
 */
export function Checkout() {
  const navigate = useNavigate();
  const { items, total, expiresAt, reservationMinutes, availability, setQuantity, removeItem, clear } = useCart();

  const admin = isAdmin();
  const customer = isCustomer();

  const [isProcessing, setIsProcessing] = useState(false);
  // O cupom do visitante mora na coluna dos produtos e mexe no total do resumo.
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const secondsLeft = useCountdown(expiresAt);
  const { checkingStock, sellableFor, blockingItems, fixAllBlocking } = useBagStock(admin);

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

      <CheckoutHead
        admin={admin}
        productCount={items.length}
        unitCount={unitCount}
        secondsLeft={secondsLeft}
        reservationMinutes={reservationMinutes}
      />

      {items.length === 0 ? (
        <EmptyBag admin={admin} />
      ) : (
        <div className="checkout-layout">
          <div className="checkout-main">
            <section className="checkout-items" aria-label="Produtos da sacola">
              {checkingStock && (
                <p className="stock-checking" role="status">Conferindo o estoque de cada item…</p>
              )}

              {items.map(item => (
                <BagItem
                  key={item.productId}
                  item={item}
                  status={availability[item.productId]}
                  left={sellableFor(item.productId)}
                  admin={admin}
                  checkingStock={checkingStock}
                  onQuantity={setQuantity}
                  onRemove={removeItem}
                />
              ))}
            </section>

            {blockingItems.length > 0 && (
              <StockAlert
                count={blockingItems.length}
                reservationExpired={secondsLeft === 0 && !admin}
                onFixAll={fixAllBlocking}
              />
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
