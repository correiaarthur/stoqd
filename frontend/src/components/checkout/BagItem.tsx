import type { CartItem, ItemAvailability } from '../../contexts/cart';
import { formatCurrency } from '../../utils/formatters';
import { LazyImage } from '../LazyImage';

type Props = {
  item: CartItem;
  /** O estoque de agora para este item; `undefined` enquanto a conferência não chegou. */
  status: ItemAvailability | undefined;
  /** Quanto este item ainda pode vender, para quem está olhando; `null` se não se sabe. */
  left: number | null;
  admin: boolean;
  checkingStock: boolean;
  onQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
};

/** Uma linha da sacola: foto, nome, quantidade e o que o estoque tem a dizer dela. */
export function BagItem({ item, status, left, admin, checkingStock, onQuantity, onRemove }: Props) {
  const short = left !== null && left < item.quantity;
  const soldOut = short && left === 0;
  const reservedElsewhere = admin && status ? status.reserved : 0;

  return (
    <div className={`checkout-item ${short ? 'short' : ''} ${soldOut ? 'sold-out' : ''}`}>
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
            <button type="button" aria-label="Diminuir quantidade" onClick={() => onQuantity(item.productId, item.quantity - 1)}>−</button>
            <span>{item.quantity}</span>
            <button type="button" aria-label="Aumentar quantidade" onClick={() => onQuantity(item.productId, item.quantity + 1)}>+</button>
          </div>
          {item.quantity > 1 && (
            <span className="checkout-item-price">{formatCurrency(item.unitPrice)} cada</span>
          )}
          <button type="button" className="btn-remove" aria-label={`Remover ${item.name}`} title="Remover" onClick={() => onRemove(item.productId)}>
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
              onClick={() => (soldOut ? onRemove(item.productId) : onQuantity(item.productId, left!))}
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
}
