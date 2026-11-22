import { useCallback, useEffect, useState } from 'react';

import { getInstallmentPlans, saveInstallmentPlans, listCoupons, updateCoupon, createCoupon, deleteCoupon } from '../services/settings';
import { formatCurrency, parseCurrencyInput, parsePercentInput } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import { simulateInstallment } from '../utils/installments';
import { DockingLabel } from '../components/DockingLabel';

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

/** Ajustes numa página só: as regras de parcelamento e, abaixo, os cupons. */
export function Settings() {
  return (
    <div className="st">
      <header className="st-head">
        <span className="st-kicker">Regras da loja</span>
        <h1 className="st-title">Ajustes</h1>
      </header>
      <InstallmentPlans />
      <Coupons />
      {/* A palavra "Cupons", colada à borda de baixo da janela com a seta até o
          título aparecer; aí ela desliza até o lugar da mesma palavra no título
          e se encaixa, formando "Cupons de desconto". */}
      <DockingLabel
        slotId="cupons-slot"
        sectionId="cupons"
        label="Cupons"
        onActivate={() => document.getElementById('cupons')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      />
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
  // O que está salvo, para a simulação mostrar o antes ao lado do depois.
  const [saved, setSaved] = useState<Plan[]>([]);
  // Valor do pedido da simulação, no formato dos outros campos de dinheiro.
  const [simulated, setSimulated] = useState('300.00');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getInstallmentPlans()
      .then(res => { setPlans(res.data || []); setSaved(res.data || []); })
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
      const res = await saveInstallmentPlans(plans);
      setPlans(res.data || []);
      setSaved(res.data || []);
      setMessage('Parcelamento salvo.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  // O limite é a maior parcela ligada. Mudar o limite liga as faixas até ele e
  // desliga as de cima, como o desenho: uma faixa acima do limite fica apagada.
  const maxActive = plans.reduce((max, plan) => (plan.active ? Math.max(max, plan.installments) : max), 0);
  const setLimit = (limit: number) => {
    setPlans(prev => prev.map(plan => ({ ...plan, active: plan.installments <= limit })));
    setMessage('');
  };

  if (loading) {
    return (
      <section className="st-plans" role="status" aria-busy="true" aria-label="Carregando o parcelamento">
        <div className="st-plans-intro">
          <span className="skeleton" style={{ width: 260, height: 40 }} />
          <span className="skeleton skeleton-line" style={{ width: '100%', height: 14 }} />
          <span className="skeleton skeleton-line" style={{ width: '92%', height: 14 }} />
          <span className="skeleton skeleton-line" style={{ width: '70%', height: 14 }} />
          <span className="skeleton" style={{ width: '100%', height: 48 }} />
        </div>
        <div className="plans-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="plan-cell"><span className="skeleton" style={{ width: '100%', height: 64 }} /></div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="st-plans" aria-labelledby="parc-titulo">
      <div className="st-plans-intro">
        <h2 id="parc-titulo" className="st-h2">Parcelamento <em>e juros</em></h2>
        <p>
          O que a cliente vê no checkout sai daqui. 0% aparece como “sem juros”;
          uma faixa desligada some da lista e não pode ser usada em venda nenhuma — nem no balcão.
          A taxa é aplicada sobre o valor já com desconto.
        </p>
        <div className="st-field">
          <label htmlFor="a-max">Parcelar em até</label>
          <select id="a-max" value={maxActive} onChange={e => setLimit(Number(e.target.value))}>
            {maxActive === 0 && <option value={0}>nenhuma faixa</option>}
            {plans.map(plan => <option key={plan.installments} value={plan.installments}>{plan.installments} vezes</option>)}
          </select>
        </div>

          {/* Simulação: a loja escolhe o valor do pedido e vê o que cada taxa faz
              com ele — antes de salvar. */}
          <div className="sim-bar">
            <div className="sim-field">
              <label htmlFor="sim-valor">Simular com um pedido de</label>
              <input
                id="sim-valor"
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={simulated ? formatCurrency(simulated) : ''}
                onChange={e => setSimulated(parseCurrencyInput(e.target.value))}
              />
            </div>
            <div className="sim-presets" role="group" aria-label="Valores de exemplo">
              {[100, 300, 500, 1000].map(value => (
                <button
                  key={value}
                  type="button"
                  className="sim-preset"
                  aria-pressed={Number(simulated) === value}
                  onClick={() => setSimulated(value.toFixed(2))}
                >
                  {formatCurrency(value).replace(',00', '')}
                </button>
              ))}
            </div>
          </div>
      </div>

      <div className="st-plans-main">
        <div className="plans-grid">
          {plans.map(plan => {
            const savedPlan = saved.find(p => p.installments === plan.installments);
            return (
              <div key={plan.installments} className={`plan-cell ${plan.active ? '' : 'off'}`}>
                <span className="plan-info">
                  <span className="plan-times">{plan.installments}x</span>
                  <span className={`plan-note ${plan.active ? (plan.interestPercent > 0 ? '' : 'free') : 'muted'}`}>
                    {plan.active ? (plan.interestPercent > 0 ? 'com juros' : 'sem juros') : 'acima do limite'}
                  </span>
                  {plan.active && <PlanExample plan={plan} saved={savedPlan} base={Number(simulated) || 0} />}
                </span>
                <span className="plan-rate">
                  <label className="sr-only" htmlFor={`j${plan.installments}`}>Juros em {plan.installments}x</label>
                  <input
                    id={`j${plan.installments}`}
                    type="text"
                    value={String(plan.interestPercent)}
                    onChange={e => patch(plan.installments, { interestPercent: Number(parsePercentInput(e.target.value)) || 0 })}
                    disabled={!plan.active}
                  />
                  <span className="plan-unit">%</span>
                </span>
              </div>
            );
          })}
        </div>

        {error && <div className="settings-error">{error}</div>}
        {message && <div className="settings-success" role="status">{message}</div>}

        <div className="st-plans-foot">
          <button type="button" className="st-save" onClick={save} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar parcelamento'}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * O que um parcelamento faz com o valor simulado: parcela, total e — se a taxa
 * foi mexida e ainda não salva — o que era antes.
 */
function PlanExample({ plan, saved, base }: { plan: Plan; saved: Plan | undefined; base: number }) {
  if (base <= 0) return null;

  const now = simulateInstallment(base, plan.interestPercent, plan.installments);
  const before = saved && saved.interestPercent !== plan.interestPercent
    ? simulateInstallment(base, saved.interestPercent, plan.installments)
    : null;
  const delta = before ? now.perInstallment - before.perInstallment : 0;

  return (
    <span className="plan-example">
      {/* O "3x" já está na própria faixa: aqui só o valor da parcela. */}
      <strong>{formatCurrency(now.perInstallment)}/parcela</strong>
      {plan.interestPercent > 0 && <span>total {formatCurrency(now.total)}</span>}
      {before && (
        <span className="plan-was">
          antes {formatCurrency(before.perInstallment)} ({saved?.interestPercent}%) ·{' '}
          {delta === 0 ? 'mesma parcela' : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`}
        </span>
      )}
    </span>
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

/** Ícone de traço, 18px, herda a cor do botão. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const dayBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/** O desconto como se lê: "10%" ou "R$ 5,00". */
const discountOf = (c: Coupon) => (c.type === 'PERCENT' ? `${c.value}%` : formatCurrency(c.value));

/** As regras do cupom numa linha: mínimo, limite e validade. */
function ruleOf(c: Coupon) {
  const parts = [
    c.minimumTotal === null ? 'sem mínimo' : `pedido mínimo ${formatCurrency(c.minimumTotal)}`,
    c.expiresAt ? `até ${dayBR(c.expiresAt)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Quanto tempo o cupom recém-criado fica em destaque na lista. */
const NEW_HIGHLIGHT_MS = 8000;

/**
 * Cupons com a estrutura de Clientes: a lista de linhas emolduradas à
 * esquerda e, à direita, o formulário — sempre aberto, sem botão para abri-lo
 * nem para fechá-lo. Em branco, cria; ao escolher um cupom da lista (a linha
 * toda ou o lápis), traz os dados dele para editar, com Cancelar para voltar
 * ao formulário em branco. O cupom recém-criado sobe para o topo da lista e
 * ganha um destaque por alguns segundos.
 */
function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_COUPON);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [newId, setNewId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listCoupons();
      setCoupons(res.data || []);
    } catch (err) {
      console.error('Erro ao carregar cupons:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // O destaque do cupom novo some sozinho.
  useEffect(() => {
    if (newId === null) return;
    const timer = window.setTimeout(() => setNewId(null), NEW_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [newId]);

  // Do mais novo para o mais antigo: o cupom que acabou de ser criado fica no topo.
  const sorted = [...coupons].sort((a, b) => b.id - a.id);
  const editing = coupons.find(c => c.id === editingId) ?? null;
  const active = coupons.filter(c => c.status === 'active').length;

  const resetForm = () => { setEditingId(null); setForm(EMPTY_COUPON); setFormError(''); };

  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      minimumTotal: coupon.minimumTotal === null ? '' : String(coupon.minimumTotal),
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
      maxUses: coupon.maxUses === null ? '' : String(coupon.maxUses),
    });
    setFormError('');
    setMessage('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
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
      if (editing) {
        await updateCoupon(editing.id, body);
        setMessage('Cupom atualizado.');
      } else {
        const res = await createCoupon(body);
        setNewId(res.data?.id ?? null);
        setMessage('Cupom criado.');
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Não foi possível salvar o cupom.'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = async (coupon: Coupon) => {
    setListError('');
    try {
      await updateCoupon(coupon.id, {
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
      setListError(getApiErrorMessage(err, 'Não foi possível alterar o cupom.'));
    }
  };

  const remove = async (coupon: Coupon) => {
    setListError('');
    try {
      const res = await deleteCoupon(coupon.id);
      // Cupom já usado é desativado em vez de apagado — a API explica por quê.
      if (res.data?.message) setListError(res.data.message);
      if (editingId === coupon.id) resetForm();
      await load();
    } catch (err) {
      setListError(getApiErrorMessage(err, 'Não foi possível apagar o cupom.'));
    }
  };

  const rowActions = (coupon: Coupon) => (
    <div className="coupon-actions">
      <button type="button" onClick={e => { e.stopPropagation(); startEdit(coupon); }}
        aria-label={`Editar ${coupon.code}`} title="Editar">
        <Icon>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </Icon>
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); toggle(coupon); }}
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
      <button type="button" className="is-danger" onClick={e => { e.stopPropagation(); remove(coupon); }}
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

  return (
    <section id="cupons" className="st-coupons" aria-labelledby="cup-titulo">
      <div className="st-coupons-head">
        <h2 id="cup-titulo" className="st-h2"><span id="cupons-slot" className="st-slot">Cupons</span> <em>de desconto</em></h2>
        <span className="st-count">
          {coupons.length === 0
            ? 'Nenhum cupom ainda'
            : `${active} valendo · ${coupons.length - active} encerrados ou desligados`}
        </span>
      </div>
      <p className="st-coupons-text">
        O cliente digita o código no carrinho e vê o desconto na hora. O uso só é contado
        quando a venda é registrada de fato — pedido pendente não gasta cupom, e pedido
        recusado devolve.
      </p>

      {message && <div className="settings-success" role="status">{message}</div>}
      {listError && <div className="settings-error">{listError}</div>}

      <div className="cp-body has-panel">
        <div className="cp-table-wrap">
          {loading ? (
            <div role="status" aria-busy="true" aria-label="Carregando cupons" className="cp-skeleton">
              {[0, 1, 2, 3].map(i => <span key={i} className="skeleton" style={{ height: 52 }} />)}
            </div>
          ) : sorted.length === 0 ? (
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
                {sorted.map(coupon => (
                  <tr
                    key={coupon.id}
                    className={`cp-row cp-row-${coupon.status} ${editingId === coupon.id ? 'is-selected' : ''} ${newId === coupon.id ? 'is-new' : ''}`}
                    onClick={() => startEdit(coupon)}
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
                    <td className="num">{rowActions(coupon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <section className="cf-panel" aria-labelledby="cupom-titulo">
          <form className="cf" onSubmit={submit}>
            <h3 id="cupom-titulo" className="cf-title">
              {editing ? <>Editar <em>cupom</em></> : <>Novo <em>cupom</em></>}
            </h3>

            <div className="cf-field">
              <label htmlFor="cupom-codigo">Código</label>
              <input id="cupom-codigo" type="text" required className="cf-code"
                placeholder="CUPOM10" value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>

            <fieldset className="cf-type">
              <legend>Tipo</legend>
              <div className="cf-type-options">
                {([['PERCENT', 'Percentual (%)'], ['FIXED', 'Valor fixo (R$)']] as const).map(([value, label]) => (
                  <label key={value} className={`cf-type-option ${form.type === value ? 'is-on' : ''}`}>
                    <input type="radio" name="cupom-tipo" checked={form.type === value}
                      onChange={() => setForm({ ...form, type: value, value: '' })} />
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
                  onChange={e => setForm({
                    ...form,
                    value: form.type === 'PERCENT' ? parsePercentInput(e.target.value) : parseCurrencyInput(e.target.value),
                  })} />
              </div>
              <div className="cf-field">
                <label htmlFor="cupom-minimo">Pedido mínimo <span>(opcional)</span></label>
                <input id="cupom-minimo" type="text" placeholder="sem mínimo" value={form.minimumTotal}
                  onChange={e => setForm({ ...form, minimumTotal: parseCurrencyInput(e.target.value) })} />
              </div>
              <div className="cf-field">
                <label htmlFor="cupom-usos">Limite de usos <span>(opcional)</span></label>
                <input id="cupom-usos" type="number" min="1" placeholder="ilimitado" value={form.maxUses}
                  onChange={e => setForm({ ...form, maxUses: e.target.value })} />
              </div>
              <div className="cf-field">
                <label htmlFor="cupom-validade">Válido até <span>(opcional)</span></label>
                <input id="cupom-validade" type="date" value={form.expiresAt}
                  onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
            </div>

            {formError && <p className="cf-error" role="alert">{formError}</p>}

            <div className="cf-actions">
              {editing && (
                <button type="button" className="cf-cancel" onClick={resetForm} disabled={isSaving}>Cancelar</button>
              )}
              <button type="submit" className="cf-submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editing ? 'Salvar cupom' : 'Criar cupom'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
