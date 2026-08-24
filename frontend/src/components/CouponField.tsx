import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatCurrency } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import './CouponField.css';

export type AppliedCoupon = { code: string; discount: number };

type Props = {
  subtotal: number;
  applied: AppliedCoupon | null;
  onChange: (coupon: AppliedCoupon | null) => void;
};

/**
 * Campo de cupom.
 *
 * O desconto depende do subtotal, então quando o carrinho muda o cupom é
 * reconferido sozinho: sem isso, um cupom de 10% aplicado sobre R$ 300
 * continuaria valendo R$ 30 depois de a pessoa remover metade dos itens.
 *
 * O que esta tela diz é informativo. Quem decide é a venda, que revalida o
 * cupom e consome o uso dentro da própria transação.
 */
export function CouponField({ subtotal, applied, onChange }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const appliedCode = applied?.code ?? null;
  const lastSubtotal = useRef(subtotal);

  useEffect(() => {
    if (!appliedCode || lastSubtotal.current === subtotal) {
      lastSubtotal.current = subtotal;
      return;
    }

    lastSubtotal.current = subtotal;

    let cancelled = false;

    api.post('/payment/coupons/validate', { code: appliedCode, subtotal })
      .then(res => { if (!cancelled) onChange({ code: res.data.code, discount: res.data.discount }); })
      .catch(err => {
        if (cancelled) return;
        // Deixou de valer para o carrinho de agora — sai, com o motivo à vista.
        setError(getApiErrorMessage(err, 'Este cupom não vale mais para este carrinho.'));
        onChange(null);
      });

    return () => { cancelled = true; };
  }, [subtotal, appliedCode, onChange]);

  const apply = async () => {
    setError('');
    setIsChecking(true);

    try {
      const res = await api.post('/payment/coupons/validate', { code, subtotal });
      onChange({ code: res.data.code, discount: res.data.discount });
      setCode('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível conferir o cupom.'));
    } finally {
      setIsChecking(false);
    }
  };

  if (applied) {
    return (
      <div className="coupon-field">
        <span className="coupon-label">Cupom</span>
        <div className="coupon-applied">
          <div className="coupon-applied-main">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <strong>{applied.code}</strong>
            <span className="coupon-applied-value">− {formatCurrency(applied.discount)}</span>
          </div>
          <button type="button" className="coupon-remove" onClick={() => { onChange(null); setError(''); }}>
            remover
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="coupon-field">
      <span className="coupon-label">Cupom de desconto</span>
      <div className="coupon-input-group">
        <input
          type="text"
          className="input-standard coupon-input"
          placeholder="Tem um código?"
          value={code}
          autoCapitalize="characters"
          onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (code.trim()) apply(); } }}
        />
        <button
          type="button"
          className="btn-secondary coupon-apply"
          onClick={apply}
          disabled={isChecking || code.trim().length < 3}
        >
          {isChecking ? '...' : 'Aplicar'}
        </button>
      </div>
      {error && <span className="coupon-error">{error}</span>}
    </div>
  );
}
