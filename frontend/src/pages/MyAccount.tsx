import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { api } from '../api';
import { formatCurrency } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/errors';
import { clearToken } from '../utils/auth';
import './MyAccount.css';

type Account = { id: number; name: string; email: string | null; phone: string; createdAt: string };

type OrderHistoryItem = {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function MyAccount() {
  const [searchParams] = useSearchParams();
  const justOrdered = searchParams.get('pedido') === 'enviado';

  const [account, setAccount] = useState<Account | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [me, history] = await Promise.all([api.get('/me'), api.get('/me/orders')]);
      setAccount(me.data);
      setOrders(history.data.orders || []);
    } catch (err) {
      console.error('Erro ao carregar a conta:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading-state">Carregando sua conta...</div>;
  if (!account) return <div className="loading-state">Não foi possível carregar sua conta.</div>;

  return (
    <div className="page-container account-page">
      <h1 className="page-title">Minha conta</h1>

      {justOrdered && (
        <div className="account-banner">
          Pedido enviado. A loja recebeu o aviso e vai confirmar com você — o estoque
          só sai quando isso acontecer.
        </div>
      )}

      <div className="account-layout">
        <ProfileCard account={account} onSaved={setAccount} />
        <PasswordCard />
      </div>

      <section className="page-card base-card account-orders">
        <h2>Minhas compras</h2>

        {orders.length === 0 ? (
          <p className="text-dim">Você ainda não fez nenhum pedido.</p>
        ) : (
          <div className="account-order-list">
            {orders.map(order => (
              <article key={order.id} className={`account-order status-${order.status.toLowerCase()}`}>
                <header>
                  <div>
                    <strong>Pedido #{order.id}</strong>
                    <span className={`badge badge-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</span>
                  </div>
                  <span className="account-order-total">{formatCurrency(order.total)}</span>
                </header>

                <span className="account-order-meta">{formatDate(order.createdAt)}</span>

                <ul className="account-order-items">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      {item.quantity}x {item.name}
                      <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </li>
                  ))}
                </ul>

                {order.cancelReason && (
                  <p className="account-order-reason">Motivo da recusa: {order.cancelReason}</p>
                )}

                {order.installments.length > 0 && (
                  <div className="account-installments">
                    <span className="text-dim">
                      {order.isPaid ? 'Pago' : `Falta ${formatCurrency(order.pendingAmount)}`}
                    </span>
                    <div className="account-installments-list">
                      {order.installments.map(installment => (
                        <span
                          key={installment.number}
                          className={`inst-pill ${installment.paidAt ? 'paid' : 'pending'}`}
                        >
                          {installment.number}/{order.installments.length} · {formatCurrency(installment.value)}
                          {installment.paidAt
                            ? ' ✓'
                            : ` · vence ${new Date(installment.dueDate).toLocaleDateString('pt-BR')}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <DangerZone />
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
      const res = await api.put('/me', form);
      onSaved(res.data);
      setMessage('Dados atualizados.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="page-card base-card">
      <h2>Seus dados</h2>

      <form className="standard-form" onSubmit={save}>
        <div className="form-group">
          <label>Nome</label>
          <input type="text" className="input-standard" required value={form.name} onChange={update('name')} />
        </div>
        <div className="form-group">
          <label>Telefone</label>
          <input type="tel" className="input-standard" required value={form.phone} onChange={update('phone')} />
        </div>
        <div className="form-group">
          <label>E-mail <span className="label-optional">(opcional)</span></label>
          <input type="email" className="input-standard" placeholder="Deixe em branco se preferir"
            value={form.email} onChange={update('email')} />
        </div>

        {error && <div className="account-error">{error}</div>}
        {message && <div className="account-success">{message}</div>}

        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
    </section>
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
      await api.put('/me/password', { currentPassword, newPassword });
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
    <section className="page-card base-card">
      <h2>Senha</h2>

      <form className="standard-form" onSubmit={save}>
        <div className="form-group">
          <label>Senha atual</label>
          <input type="password" className="input-standard" required
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Nova senha</label>
          <input type="password" className="input-standard" required minLength={8}
            placeholder="Pelo menos 8 caracteres"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>

        {error && <div className="account-error">{error}</div>}
        {message && <div className="account-success">{message}</div>}

        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Trocar senha'}
        </button>

        {/* Recuperação por e-mail entra depois; até lá o caminho é falar com a
            loja, e a tela precisa dizer isso em vez de deixar a pessoa travada. */}
        <p className="account-note">
          Esqueceu a senha? Fale com a loja: a redefinição é feita manualmente por enquanto.
        </p>
      </form>
    </section>
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
      await api.delete('/me');
      clearToken();
      window.location.href = '/';
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir a conta.'));
    }
  };

  return (
    <section className="page-card base-card account-danger">
      <h2>Excluir minha conta</h2>

      <p className="text-dim">
        Apaga seu nome, telefone, e-mail e senha deste site. O registro das compras
        que você já fez continua com a loja — é o histórico de vendas dela, e some
        do seu acesso, não do controle da loja. Pedidos ainda não confirmados são
        cancelados.
      </p>

      {error && <div className="account-error">{error}</div>}

      {isConfirming ? (
        <div className="account-danger-actions">
          <button className="btn-secondary" onClick={() => setIsConfirming(false)}>Cancelar</button>
          <button className="btn-danger" onClick={destroy}>Sim, excluir minha conta</button>
        </div>
      ) : (
        <button className="btn-danger" onClick={() => setIsConfirming(true)}>Excluir conta</button>
      )}
    </section>
  );
}
