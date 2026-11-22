import { CouponActions } from './CouponActions';
import { STATUS_LABEL, discountOf, ruleOf } from './couponFormat';
import type { Coupon } from './types';

type Props = {
  coupons: Coupon[];
  loading: boolean;
  editingId: number | null;
  /** O cupom recém-criado, em destaque por alguns segundos. */
  newId: number | null;
  onEdit: (coupon: Coupon) => void;
  onToggle: (coupon: Coupon) => void;
  onRemove: (coupon: Coupon) => void;
};

/** A lista de cupons: esqueleto, estado vazio ou a tabela de linhas emolduradas. */
export function CouponTable({ coupons, loading, editingId, newId, onEdit, onToggle, onRemove }: Props) {
  return (
    <div className="cp-table-wrap">
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Carregando cupons" className="cp-skeleton">
          {[0, 1, 2, 3].map(i => <span key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
      ) : coupons.length === 0 ? (
        <p className="text-dim">Nenhum cupom criado ainda. Preencha o formulário ao lado para criar o primeiro.</p>
      ) : (
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Cupom</th>
              <th scope="col" className="num">Desconto</th>
              <th scope="col">Usos</th>
              <th scope="col">Situação</th>
              <th scope="col" className="num"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map(coupon => (
              <tr
                key={coupon.id}
                className={`cp-row cp-row-${coupon.status} ${editingId === coupon.id ? 'is-selected' : ''} ${newId === coupon.id ? 'is-new' : ''}`}
                onClick={() => onEdit(coupon)}
              >
                <td>
                  <button type="button" className="cp-open" aria-pressed={editingId === coupon.id}>
                    <strong>
                      {coupon.code}
                      {newId === coupon.id && <span className="cp-new-tag">Novo</span>}
                    </strong>
                    <span>{ruleOf(coupon)}</span>
                  </button>
                </td>
                <td className="num cp-discount">{discountOf(coupon)}</td>
                <td className="cp-uses">{coupon.maxUses === null ? `${coupon.usedCount} · ilimitado` : `${coupon.usedCount} de ${coupon.maxUses}`}</td>
                <td>
                  <span className={`cp-status cp-status-${coupon.status}`}>
                    <span className="cp-dot" aria-hidden="true" />
                    {STATUS_LABEL[coupon.status]}
                  </span>
                </td>
                <td className="num">
                  <CouponActions coupon={coupon} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
