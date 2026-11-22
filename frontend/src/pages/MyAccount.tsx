import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getMe, getMyOrders, updateMe, changePassword, deleteMe } from '../services/account';
import { formatCurrency, formatDayMonth, formatRelativeDate } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import { clearToken } from '../utils/auth';
import { useAsync } from '../hooks/useAsync';
import './MyAccount.css';

type Account = { id: number; name: string; email: string | null; phone: string; createdAt: string };

type OrderHistoryItem = {
  /** Pedido feito pela vitrine, ou venda de balcão do cliente vinculado. */
  source: 'ORDER' | 'SALE';
  id: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  cancelReason: string | null;
  saleId: number | null;
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  installments: Array<{ number: number; value: number; dueDate: string; paidAt: string | null }>;
  pendingAmount: number;
  isPaid: boolean;
};

const STATUS_LABEL: Record<OrderHistoryItem['status'], string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Recusado',
};

/** O que a loja já sabe do pagamento: parcelas dizem tudo; sem elas, nada se afirma. */
function paymentText(order: OrderHistoryItem) {
  const n = order.installments.length;
  if (n > 1) return order.isPaid ? `${n}x · quitada` : `${n}x no cartão`;
  if (n === 1 || order.status === 'CONFIRMED') return 'À vista';
  return null;
}

/** Ícone e cores do selo de situação, no rodapé do cartão. */
const SEAL: Record<OrderHistoryItem['status'], { icon: string; className: string }> = {
  PENDING: { icon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', className: 'is-pending' },
  CONFIRMED: { icon: 'M20 6L9 17l-5-5', className: 'is-confirmed' },
  CANCELLED: { icon: 'M18 6L6 18M6 6l12 12', className: 'is-cancelled' },
};

type AccountData = { account: Account | null; orders: OrderHistoryItem[] };

/** Enquanto nada chegou — e se a carga falhar, `account` fica nulo e a tela avisa. */
const NOT_LOADED: AccountData = { account: null, orders: [] };

async function fetchAccount(): Promise<AccountData> {
  const [me, history] = await Promise.all([getMe(), getMyOrders()]);
  return { account: me.data, orders: history.data.orders || [] };
}

export function MyAccount() {
  const [searchParams] = useSearchParams();
  const justOrdered = searchParams.get('pedido') === 'enviado';

  const { data, setData, loading } = useAsync<AccountData>(fetchAccount, {
    initial: NOT_LOADED,
    errorMessage: 'Erro ao carregar a conta:',
  });
  const { account, orders } = data;

  // O perfil salvo na própria tela substitui o que veio do servidor, sem refazer a busca.
  const setAccount = (saved: Account) => setData(current => ({ ...current, account: saved }));

  // A parcela em aberto que vence primeiro, entre os pedidos confirmados.
  const nextInstallment = useMemo(() => {
    const open = orders
      .filter(order => order.status === 'CONFIRMED')
      .flatMap(order => order.installments)
      .filter(installment => !installment.paidAt)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return open[0] ?? null;
  }, [orders]);

  if (loading) return <AccountSkeleton />;
  if (!account) return <div className="loading-state">Não foi possível carregar sua conta.</div>;

  const firstName = account.name.trim().split(/\s+/)[0];

  return (
    <div className="page-container account-page">
      <div className="account-head">
        <div className="account-head-text">
          <span className="account-kicker">Minha conta</span>
          <h1 className="account-title">Olá, <em>{firstName}.</em></h1>
        </div>
        <div className="account-stats">
          <div className="account-stat">
            <span className="account-stat-label">Pedidos</span>
            <span className="account-stat-value">{orders.length}</span>
          </div>
          {nextInstallment && (
            <div className="account-stat">
              <span className="account-stat-label">Próxima parcela</span>
              <span className="account-stat-value">{formatCurrency(nextInstallment.value)}</span>
              <span className="account-stat-note">vence em {formatDayMonth(nextInstallment.dueDate)}</span>
            </div>
          )}
        </div>
      </div>

      {justOrdered && (
        <aside className="account-banner" role="status">
          Pedido enviado. A loja recebeu o aviso e vai confirmar com você — o estoque
          só sai quando isso acontecer.
        </aside>
      )}

      <div className="account-layout">
        <section aria-labelledby="compras-titulo" className="account-orders">
          <h2 id="compras-titulo" className="account-h2">Minhas <em>compras</em></h2>

          {orders.length === 0 ? (
            <p className="account-empty">Você ainda não fez nenhum pedido.</p>
          ) : (
            <div className="account-order-list">
              {orders.map(order => {
                const seal = SEAL[order.status];
                const payment = paymentText(order);

                return (
                  <article key={`${order.source}-${order.id}`} className="account-order">
                    <div className="account-order-body">
                      <div className="account-order-top">
                        <span className="account-order-text">
                          <span className="account-order-meta">
                            {order.source === 'SALE' ? 'Balcão' : 'Pedido'} #{String(order.id).padStart(4, '0')} · {formatRelativeDate(order.createdAt)}{payment ? ` · ${payment}` : ''}
                          </span>
                          <strong className="account-order-products">
                            {order.items.map(item => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(', ')}
                          </strong>
                        </span>
                        <strong className="account-order-total">{formatCurrency(order.total)}</strong>
                      </div>

                      {order.status === 'PENDING' && (
                        <p className="account-order-note">A loja vai ligar para confirmar antes de separar.</p>
                      )}
                      {order.cancelReason && (
                        <p className="account-order-note is-bad">“{order.cancelReason}”</p>
                      )}

                      {order.installments.length > 1 && (
                        <div className="account-installments">
                          {order.installments.map(installment => (
                            <span
                              key={installment.number}
                              className={`inst-pill ${installment.paidAt ? 'paid' : 'pending'}`}
                            >
                              {installment.number}/{order.installments.length} · {formatCurrency(installment.value)}
                              {installment.paidAt ? ' ✓' : ` · vence ${formatDayMonth(installment.dueDate)}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={`account-seal ${seal.className}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={seal.icon} /></svg>
                      <span><span className="sr-only">Situação: </span>{STATUS_LABEL[order.status]}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="account-side">
          <ProfileCard account={account} onSaved={setAccount} />
          <PasswordCard />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="page-container account-page" role="status" aria-busy="true" aria-label="Carregando sua conta">
      <div className="account-head">
        <div className="account-head-text">
          <span className="skeleton skeleton-line" style={{ width: 110, height: 14 }} />
          <span className="skeleton" style={{ width: 'min(100%, 420px)', height: 76 }} />
        </div>
        <span className="skeleton" style={{ width: 220, height: 60 }} />
      </div>
      <div className="account-layout">
        <div className="account-order-list">
          {[0, 1, 2].map(i => <span key={i} className="skeleton" style={{ height: 140 }} />)}
        </div>
        <span className="skeleton" style={{ height: 420 }} />
      </div>
    </div>
  );
}

function ProfileCard({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [form, setForm] = useState({ name: account.name, phone: account.phone, email: account.email ?? '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsSaving(true);

    try {
      const res = await updateMe(form);
      onSaved(res.data);
      setMessage('Dados atualizados.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="account-card-green" aria-labelledby="dados-titulo" onSubmit={save}>
      <h2 id="dados-titulo" className="account-card-title">Seus <em>dados</em></h2>

      <div className="account-field">
        <label htmlFor="m-nome">Nome</label>
        <input id="m-nome" type="text" required value={form.name} onChange={update('name')} />
      </div>
      <div className="account-field">
        <label htmlFor="m-tel">Telefone</label>
        <input id="m-tel" type="tel" required value={form.phone} onChange={update('phone')} />
      </div>
      <div className="account-field">
        <label htmlFor="m-email">E-mail <span>(opcional)</span></label>
        <input id="m-email" type="email" placeholder="Deixe em branco se preferir"
          value={form.email} onChange={update('email')} />
      </div>

      {error && <div className="account-error" role="alert">{error}</div>}
      {message && <div className="account-success" role="status">{message}</div>}

      <button type="submit" className="account-btn-light" disabled={isSaving}>
        {isSaving ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </form>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsSaving(true);

    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Senha alterada.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível trocar a senha.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="account-password" aria-labelledby="senha-titulo" onSubmit={save}>
      <h2 id="senha-titulo" className="account-h3">Senha</h2>

      <div className="account-password-fields">
        <div className="account-field is-light">
          <label htmlFor="m-atual">Senha atual</label>
          <input id="m-atual" type="password" required
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div className="account-field is-light">
          <label htmlFor="m-nova">Nova senha</label>
          <input id="m-nova" type="password" required minLength={8}
            placeholder="Pelo menos 8 caracteres"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>
      </div>

      {error && <div className="account-error is-light" role="alert">{error}</div>}
      {message && <div className="account-success is-light" role="status">{message}</div>}

      <button type="submit" className="account-btn-line" disabled={isSaving}>
        {isSaving ? 'Salvando...' : 'Trocar senha'}
      </button>

      {/* Recuperação por e-mail entra depois; até lá o caminho é falar com a
          loja, e a tela precisa dizer isso em vez de deixar a pessoa travada. */}
      <p className="account-note">
        Esqueceu a senha? Fale com a loja: a redefinição é feita manualmente por enquanto.
      </p>
    </form>
  );
}

/**
 * Excluir o perfil apaga os dados de acesso — e só eles. O histórico de compras
 * continua no sistema da loja, porque a venda é dela também. É por isso que a
 * confirmação diz exatamente o que sai e o que fica.
 */
function DangerZone() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');

  const destroy = async () => {
    setError('');

    try {
      await deleteMe();
      clearToken();
      window.location.href = '/';
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir a conta.'));
    }
  };

  return (
    <div className="account-danger">
      <p className="account-danger-text">
        Excluir a conta apaga seu nome, telefone, e-mail e senha deste site. As compras
        continuam no caderno da loja; pedidos ainda não confirmados são cancelados.
      </p>

      {error && <div className="account-error is-light" role="alert">{error}</div>}

      {isConfirming ? (
        <div className="account-danger-actions">
          <button type="button" className="account-btn-line" onClick={() => setIsConfirming(false)}>Cancelar</button>
          <button type="button" className="account-btn-danger" onClick={destroy}>Sim, excluir minha conta</button>
        </div>
      ) : (
        <button type="button" className="account-danger-link" onClick={() => setIsConfirming(true)}>Excluir minha conta</button>
      )}
    </div>
  );
}
