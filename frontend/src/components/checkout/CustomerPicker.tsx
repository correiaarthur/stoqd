import { useRef } from 'react';

import { useClickOutside } from '../../hooks/useClickOutside';
import type { CustomerPicker as Picker } from '../../hooks/useCustomerPicker';

type Props = {
  picker: Picker;
  onNew: () => void;
};

/** A busca de cliente do balcão, com o botão que abre o cadastro rápido. */
export function CustomerPicker({ picker, onNew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, picker.close);

  return (
    <div className="checkout-customer">
      <div className="custom-select-wrapper" ref={containerRef}>
        <svg className="select-icon user-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
        </svg>

        <input
          type="text"
          className="checkout-customer-select"
          placeholder="Consumidor final"
          value={picker.searchText}
          onChange={e => picker.type(e.target.value)}
          onFocus={picker.open}
        />

        {picker.searchText ? (
          <svg className="select-icon chevron-icon clear-icon" onClick={() => picker.select('', '')} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg className="select-icon chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        )}

        {picker.isOpen && (
          <div className="customer-dropdown-menu">
            <div className="customer-dropdown-item special-item" onClick={() => picker.select('', '')}>
              Consumidor final
            </div>
            {picker.filtered.map(c => (
              <div key={c.id} className="customer-dropdown-item" onClick={() => picker.select(String(c.id), c.name)}>
                {c.name} <span className="customer-phone-dropdown">{c.phone}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="btn-new-customer" onClick={onNew}>+ Novo</button>
    </div>
  );
}
