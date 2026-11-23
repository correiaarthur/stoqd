import { Icon } from './Icon';
import type { Coupon } from './types';

type Props = {
  coupon: Coupon;
  onEdit: (coupon: Coupon) => void;
  onToggle: (coupon: Coupon) => void;
  onRemove: (coupon: Coupon) => void;
};

/** Lápis, olho e lixeira da linha. O clique não sobe: a linha inteira também edita. */
export function CouponActions({ coupon, onEdit, onToggle, onRemove }: Props) {
  return (
    <div className="coupon-actions">
      <button type="button" onClick={e => { e.stopPropagation(); onEdit(coupon); }}
        aria-label={`Editar ${coupon.code}`} title="Editar">
        <Icon>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </Icon>
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onToggle(coupon); }}
        aria-label={`${coupon.active ? 'Desativar' : 'Reativar'} ${coupon.code}`}
        title={coupon.active ? 'Desativar' : 'Reativar'}>
        {coupon.active ? (
          <Icon>
            <path d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9" />
            <path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2" />
            <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </Icon>
        ) : (
          <Icon>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </Icon>
        )}
      </button>
      <button type="button" className="is-danger" onClick={e => { e.stopPropagation(); onRemove(coupon); }}
        aria-label={`Apagar ${coupon.code}`} title="Apagar">
        <Icon>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </Icon>
      </button>
    </div>
  );
}
