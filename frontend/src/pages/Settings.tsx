import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { formatCurrency, parseCurrencyInput, parsePercentInput } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import './Settings.css';

type Plan = { installments: number; interestPercent: number; active: boolean };

type Coupon = {
  id: number;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minimumTotal: number | null;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  status: 'active' | 'inactive' | 'expired' | 'exhausted';
};

const STATUS_LABEL: Record<Coupon['status'], string> = {
  active: 'Valendo',
  inactive: 'Desativado',
  expired: 'Vencido',
  exhausted: 'Esgotado',
};

export function Settings() {
  return (
    <div className="page-container settings-page">
      <h1 className="page-title">Ajustes</h1>
      <InstallmentPlans />
      <Coupons />
    </div>
  );
}

/**
 * Tabela de juros por parcelamento.
 *
 * A loja edita tudo junto e salva de uma vez: linha a linha daria o estado
 * meio-salvo em que 3x já subiu de juros e 6x ainda não.
 */
function InstallmentPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings/installments')
      .then(res => setPlans(res.data || []))
      .catch(err => console.error('Erro ao carregar parcelamento:', err))
      .finally(() => setLoading(false));
  }, []);

  const patch = (installments: number, changes: Partial<Plan>) => {
    setPlans(prev => prev.map(plan => (plan.installments === installments ? { ...plan, ...changes } : plan)));
    setMessage('');
  };

  const save = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);

    try {
      const res = await api.put('/settings/installments', { plans });
      setPlans(res.data || []);
      setMessage('Parcelamento salvo.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <section className="page-card base-card"><p className="text-dim">Carregando...</p></section>;

  return (
    <section className="page-card base-card">
      <div className="settings-head">
        <h2>Parcelamento e juros</h2>
        <p className="text-dim">
          A taxa é aplicada sobre o valor já com desconto, e o cliente vê o valor da parcela
          antes de enviar o pedido. Opção desligada some da tela e não pode ser usada em venda
          nenhuma — nem no balcão.
        </p>
      </div>

      <div className="plans-grid">
        {plans.map(plan => (
          <div key={plan.installments} className={`plan-row ${plan.active ? '' : 'off'}`}>
            <label className="plan-toggle">
              <input
                type="checkbox"
                checked={plan.active}
                onChange={e => patch(plan.installments, { active: e.target.checked })}
              />
              <span className="plan-name">{plan.installments}x</span>
            </label>

            <div className="plan-rate">
              <input
                type="text"
                className="input-standard"
                value={String(plan.interestPercent)}
                onChange={e => patch(plan.installments, { interestPercent: Number(parsePercentInput(e.target.value)) || 0 })}
                disabled={!plan.active}
              />
              <span className="plan-unit">%</span>
            </div>

            <span className="plan-example">
              {plan.interestPercent > 0
                ? `R$ 300 → ${formatCurrency(300 * (1 + plan.interestPercent / 100) / plan.installments)} por parcela`
                : 'sem juros'}
            </span>
          </div>
        ))}
      </div>

      {error && <div className="settings-error">{error}</div>}
      {message && <div className="settings-success">{message}</div>}

      <button className="btn-primary" onClick={save} disabled={isSaving}>
        {isSaving ? 'Salvando...' : 'Salvar parcelamento'}
      </button>
    </section>
  );
}

type CouponForm = {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  minimumTotal: string;
  expiresAt: string;
  maxUses: string;
};

const EMPTY_COUPON: CouponForm = {
  code: '', type: 'PERCENT', value: '', minimumTotal: '', expiresAt: '', maxUses: '',
};

function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CouponForm>(EMPTY_COUPON);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/coupons');
      setCoupons(res.data || []);
    } catch (err) {
      console.error('Erro ao carregar cupons:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(EMPTY_COUPON); setEditingId(null); setError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    const body = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      minimumTotal: form.minimumTotal === '' ? null : Number(form.minimumTotal),
      expiresAt: form.expiresAt || null,
      maxUses: form.maxUses === '' ? null : Number(form.maxUses),
    };

    try {
      if (editingId) await api.put(`/coupons/${editingId}`, body);
      else await api.post('/coupons', body);

      reset();
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o cupom.'));
    } finally {
      setIsSaving(false);
    }
  };

  const edit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setError('');
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      minimumTotal: coupon.minimumTotal === null ? '' : String(coupon.minimumTotal),
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
      maxUses: coupon.maxUses === null ? '' : String(coupon.maxUses),
    });
  };

  const toggle = async (coupon: Coupon) => {
    try {
      await api.put(`/coupons/${coupon.id}`, {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minimumTotal: coupon.minimumTotal,
        expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : null,
        maxUses: coupon.maxUses,
        active: !coupon.active,
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível alterar o cupom.'));
    }
  };

  const remove = async (coupon: Coupon) => {
    try {
      const res = await api.delete(`/coupons/${coupon.id}`);
      // Cupom já usado é desativado em vez de apagado — a API explica por quê.
      if (res.data?.message) setError(res.data.message);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível apagar o cupom.'));
    }
  };

  return (
    <section className="page-card base-card">
      <div className="settings-head">
        <h2>Cupons de desconto</h2>
        <p className="text-dim">
          O cliente digita o código no carrinho e vê o desconto na hora. O uso só é contado
          quando a venda é registrada de fato — pedido pendente não gasta cupom, e pedido
          recusado devolve.
        </p>
      </div>

      <form className="coupon-form" onSubmit={submit}>
        <div className="form-group">
          <label>Código</label>
          <input type="text" className="input-standard coupon-code-input" required placeholder="CICLO10"
            value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
        </div>

        <div className="form-group">
          <label>Tipo</label>
          <select className="input-standard" value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FIXED', value: '' })}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
          </select>
        </div>

        <div className="form-group">
          <label>{form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}</label>
          <input type="text" className="input-standard" required
            placeholder={form.type === 'PERCENT' ? '10' : '20,00'}
            value={form.value}
            onChange={e => setForm({
              ...form,
              value: form.type === 'PERCENT' ? parsePercentInput(e.target.value) : parseCurrencyInput(e.target.value),
            })} />
        </div>

        <div className="form-group">
          <label>Pedido mínimo <span className="label-optional">(opcional)</span></label>
          <input type="text" className="input-standard" placeholder="sem mínimo"
            value={form.minimumTotal}
            onChange={e => setForm({ ...form, minimumTotal: parseCurrencyInput(e.target.value) })} />
        </div>

        <div className="form-group">
          <label>Válido até <span className="label-optional">(opcional)</span></label>
          <input type="date" className="input-standard"
            value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
        </div>

        <div className="form-group">
          <label>Limite de usos <span className="label-optional">(opcional)</span></label>
          <input type="number" min="1" className="input-standard" placeholder="ilimitado"
            value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} />
        </div>

        <div className="coupon-form-actions">
          {editingId && <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>}
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar cupom'}
          </button>
        </div>
      </form>

      {error && <div className="settings-error">{error}</div>}

      {loading ? (
        <p className="text-dim">Carregando cupons...</p>
      ) : coupons.length === 0 ? (
        <p className="text-dim">Nenhum cupom criado ainda.</p>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th><th>Desconto</th><th>Mínimo</th><th>Validade</th><th>Usos</th><th>Situação</th><th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(coupon => (
                <tr key={coupon.id} className={coupon.status === 'active' ? '' : 'row-off'}>
                  <td><strong className="coupon-code">{coupon.code}</strong></td>
                  <td>{coupon.type === 'PERCENT' ? `${coupon.value}%` : formatCurrency(coupon.value)}</td>
                  <td>{coupon.minimumTotal === null ? '—' : formatCurrency(coupon.minimumTotal)}</td>
                  <td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{coupon.usedCount}{coupon.maxUses === null ? '' : `/${coupon.maxUses}`}</td>
                  <td>
                    <span className={`badge badge-coupon-${coupon.status}`}>{STATUS_LABEL[coupon.status]}</span>
                  </td>
                  <td className="coupon-actions">
                    <button type="button" onClick={() => edit(coupon)}>editar</button>
                    <button type="button" onClick={() => toggle(coupon)}>
                      {coupon.active ? 'desativar' : 'reativar'}
                    </button>
                    <button type="button" className="is-danger" onClick={() => remove(coupon)}>apagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
