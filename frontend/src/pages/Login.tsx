import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { login } from '../services/account';
import { saveToken } from '../utils/auth';
import { getApiErrorMessage } from '../utils/errors';
import { AuthShell } from '../components/AuthShell';

export function Login() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');

    try {
      const response = await login(identifier, password);

      saveToken(response.data.token);

      // Admin cai no painel; cliente volta para onde estava — em geral o
      // checkout que pediu o login.
      const destination = next || (response.data.user?.role === 'admin' ? '/dashboard' : '/');
      window.location.href = destination;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Telefone ou senha incorretos.'));
    }
  };

  // O campo é um só para os dois acessos, e se ajusta ao que a pessoa digita:
  // com "@" ele vira o campo de e-mail da administração; sem, é o telefone do
  // cliente. Assim a tela diz que os dois caminhos existem, sem pedir que a
  // pessoa escolha antes de começar.
  const isEmail = identifier.includes('@');

  // Quem veio do checkout volta para ele: o botão diz isso.
  const backToBag = !!next && next.startsWith('/checkout');

  return (
    <AuthShell mode="login" next={next}>
      <form
        className="auth-form auth-form-login"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <p className="auth-lead">
          Clientes entram com o telefone. A administração entra com o e-mail.
        </p>

        {/* Um campo só para os dois tipos de conta: o cliente digita o
            telefone, a administração digita o e-mail do .env — que nunca vai
            casar com um número. */}
        <div className="auth-field">
          <label htmlFor="login-identificador" className="label-caps">
            {isEmail ? 'E-mail da administração' : 'Telefone'}
          </label>
          <input
            id="login-identificador"
            type="text"
            inputMode={isEmail ? 'email' : 'tel'}
            className="input-standard"
            placeholder="(87) 90000-0000"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-senha" className="label-caps">Senha</label>
          <input
            id="login-senha"
            type="password"
            className="input-standard"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="auth-cta auth-cta-green">
          {backToBag ? 'Entrar e voltar à sacola' : 'Entrar'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </form>
    </AuthShell>
  );
}
