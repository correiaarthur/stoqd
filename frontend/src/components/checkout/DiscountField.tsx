import type { useDiscountInput } from '../../hooks/useDiscountInput';

/** O desconto do balcão: alterna entre R$ e %, e o campo se adapta. */
export function DiscountField({ discount }: { discount: ReturnType<typeof useDiscountInput> }) {
  return (
    <div className="form-group">
      <label className="sr-only">Desconto</label>
      <div className="checkout-discount-group">
        <div className="checkout-discount-toggle">
          <button
            type="button"
            className={`checkout-toggle-btn ${discount.type === 'fixed' ? 'active' : ''}`}
            onClick={() => discount.setType('fixed')}
          >R$</button>
          <button
            type="button"
            className={`checkout-toggle-btn ${discount.type === 'percentage' ? 'active' : ''}`}
            onClick={() => discount.setType('percentage')}
          >%</button>
        </div>
        <input
          type="text"
          className="input-standard"
          placeholder={discount.type === 'percentage' ? '0' : '0.00'}
          value={discount.input}
          onChange={e => discount.onInputChange(e.target.value)}
        />
      </div>
    </div>
  );
}
