import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api } from '../api';
import { saveToken } from '../utils/auth';
import { getApiErrorMessage } from '../utils/errors';
import './Login.css';

export function Register() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const res = await api.post('/auth/register', form);
      saveToken(res.data.token);

      // Recarrega para o cabeçalho e o carrinho enxergarem o novo papel.
      window.location.href = next;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível criar a conta.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card base-card">
        <div className="login-header">
          <span className="brand-symbol">✦</span>
          <h1 className="brand-name">stoqd</h1>
          <p>Crie sua conta para enviar pedidos pela vitrine.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label>Nome</label>
            <input type="text" className="input-standard" placeholder="Como podemos te chamar" required
              value={form.name} onChange={update('name')} />
          </div>

          <div className="form-group">
            <label>Telefone</label>
            <input type="tel" className="input-standard" placeholder="(11) 90000-0000" required
              value={form.phone} onChange={update('phone')} />
            <small className="field-hint">É por ele que você entra depois, e como a loja fala com você.</small>
          </div>

          <div className="form-group">
            <label>E-mail <span className="label-optional">(opcional)</span></label>
            <input type="email" className="input-standard" placeholder="exemplo@email.com"
              value={form.email} onChange={update('email')} />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input type="password" className="input-standard" placeholder="Pelo menos 8 caracteres" required
              minLength={8} value={form.password} onChange={update('password')} />
          </div>

          {/* Passamos a guardar dado pessoal de terceiros: a pessoa precisa ler
              para que serve antes de entregar. */}
          <label className="login-consent">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
            <span>
              Concordo em fornecer meu nome e telefone — e o e-mail, se eu quiser
              informar — para que a loja possa confirmar meus pedidos e combinar entrega
              e pagamento. Esses dados não são usados para mais nada, e posso excluir
              minha conta quando quiser.
            </span>
          </label>

          <button type="submit" className="btn-primary login-btn" disabled={isSubmitting || !consent}>
            {isSubmitting ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        <div className="login-footer">
          Já tem conta? <Link to={`/login?next=${encodeURIComponent(next)}`}>Entrar</Link>
        </div>
      </div>
    </div>
  );
}
