import type { FormEvent } from 'react';

import { parseCurrencyInput, parsePercentInput } from '../../utils/formatters';
import type { CouponForm } from './types';

type Props = {
  form: CouponForm;
  onChange: (form: CouponForm) => void;
  /** `true` ao editar um cupom que já existe; `false` ao criar. */
  editing: boolean;
  error: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/** O formulário de cupom, sempre aberto ao lado da lista: em branco cria, com um cupom escolhido edita. */
export function CouponFormPanel({ form, onChange, editing, error, isSaving, onSubmit, onCancel }: Props) {
  return (
    <section className="cf-panel" aria-labelledby="cupom-titulo">
      <form className="cf" onSubmit={onSubmit}>
        <h3 id="cupom-titulo" className="cf-title">
          {editing ? <>Editar <em>cupom</em></> : <>Novo <em>cupom</em></>}
        </h3>

        <div className="cf-field">
          <label htmlFor="cupom-codigo">Código</label>
          <input id="cupom-codigo" type="text" required className="cf-code"
            placeholder="CUPOM10" value={form.code}
            onChange={e => onChange({ ...form, code: e.target.value.toUpperCase() })} />
        </div>

        <fieldset className="cf-type">
          <legend>Tipo</legend>
          <div className="cf-type-options">
            {([['PERCENT', 'Percentual (%)'], ['FIXED', 'Valor fixo (R$)']] as const).map(([value, label]) => (
              <label key={value} className={`cf-type-option ${form.type === value ? 'is-on' : ''}`}>
                <input type="radio" name="cupom-tipo" checked={form.type === value}
                  onChange={() => onChange({ ...form, type: value, value: '' })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="cf-grid">
          <div className="cf-field">
            <label htmlFor="cupom-desconto">{form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}</label>
            <input id="cupom-desconto" type="text" required
              placeholder={form.type === 'PERCENT' ? '10' : '20,00'}
              value={form.value}
              onChange={e => onChange({
                ...form,
                value: form.type === 'PERCENT' ? parsePercentInput(e.target.value) : parseCurrencyInput(e.target.value),
              })} />
          </div>
          <div className="cf-field">
            <label htmlFor="cupom-minimo">Pedido mínimo <span>(opcional)</span></label>
            <input id="cupom-minimo" type="text" placeholder="sem mínimo" value={form.minimumTotal}
              onChange={e => onChange({ ...form, minimumTotal: parseCurrencyInput(e.target.value) })} />
          </div>
          <div className="cf-field">
            <label htmlFor="cupom-usos">Limite de usos <span>(opcional)</span></label>
            <input id="cupom-usos" type="number" min="1" placeholder="ilimitado" value={form.maxUses}
              onChange={e => onChange({ ...form, maxUses: e.target.value })} />
          </div>
          <div className="cf-field">
            <label htmlFor="cupom-validade">Válido até <span>(opcional)</span></label>
            <input id="cupom-validade" type="date" value={form.expiresAt}
              onChange={e => onChange({ ...form, expiresAt: e.target.value })} />
          </div>
        </div>

        {error && <p className="cf-error" role="alert">{error}</p>}

        <div className="cf-actions">
          {editing && (
            <button type="button" className="cf-cancel" onClick={onCancel} disabled={isSaving}>Cancelar</button>
          )}
          <button type="submit" className="cf-submit" disabled={isSaving}>
            {isSaving ? 'Salvando...' : editing ? 'Salvar cupom' : 'Criar cupom'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </form>
    </section>
  );
}
