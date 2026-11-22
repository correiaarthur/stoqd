import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { api } from '../api';
import { saveToken } from '../utils/auth';
import { getApiErrorMessage } from '../utils/errors';
import { AuthShell } from '../components/AuthShell';

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

  const toCheckout = next.startsWith('/checkout');

  return (
    <AuthShell mode="register" next={searchParams.get('next')}>
      <form className="auth-form auth-form-register" onSubmit={handleSubmit}>
        <p className="auth-lead">Para enviar pedidos pela vitrine. Leva um minuto.</p>

        {/* Dois a dois: o formulário cabe na tela sem rolagem. */}
        <div className="auth-grid">
          <div className="auth-field">
            <label htmlFor="cadastro-nome" className="label-caps">Nome</label>
            <input id="cadastro-nome" type="text" className="input-standard" placeholder="Como podemos te chamar"
              autoComplete="name" required value={form.name} onChange={update('name')} />
          </div>

          <div className="auth-field">
            <label htmlFor="cadastro-telefone" className="label-caps">Telefone</label>
            <input id="cadastro-telefone" type="tel" className="input-standard" placeholder="(87) 90000-0000"
              autoComplete="tel" required value={form.phone} onChange={update('phone')} aria-describedby="cadastro-telefone-dica" />
          </div>
        </div>
        <small id="cadastro-telefone-dica" className="auth-hint">É pelo telefone que você entra depois, e é como a loja fala com você.</small>

        <div className="auth-grid">
          <div className="auth-field">
            <label htmlFor="cadastro-email" className="label-caps">E-mail <span className="auth-optional">(opcional)</span></label>
            <input id="cadastro-email" type="email" className="input-standard" placeholder="exemplo@email.com"
              autoComplete="email" value={form.email} onChange={update('email')} />
          </div>

          <div className="auth-field">
            <label htmlFor="cadastro-senha" className="label-caps">Senha</label>
            <input id="cadastro-senha" type="password" className="input-standard" placeholder="Pelo menos 8 caracteres"
              autoComplete="new-password" required minLength={8} value={form.password} onChange={update('password')} />
          </div>
        </div>

        {/* Passamos a guardar dado pessoal de terceiros: a pessoa precisa ler
            para que serve antes de entregar. */}
        <label className="auth-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
          <span>
            Concordo em fornecer meu nome e telefone — e o e-mail, se eu quiser
            informar — para que a loja possa confirmar meus pedidos e combinar entrega
            e pagamento. Esses dados não são usados para mais nada, e posso excluir
            minha conta quando quiser.
          </span>
        </label>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="auth-cta auth-cta-coroa" disabled={isSubmitting || !consent}>
          {isSubmitting ? 'Criando...' : toCheckout ? 'Criar conta e enviar pedido' : 'Criar conta'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </form>
    </AuthShell>
  );
}
