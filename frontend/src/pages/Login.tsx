import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { saveToken } from '../utils/auth';
import { getApiErrorMessage } from '../utils/errors';
import './Login.css';

export function Login() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');

    try {
      const response = await api.post('/auth/login', { identifier, password });

      saveToken(response.data.token);

      // Admin cai no painel; cliente volta para onde estava — em geral o
      // checkout que pediu o login.
      const destination = next || (response.data.user?.role === 'admin' ? '/dashboard' : '/');
      window.location.href = destination;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Telefone ou senha incorretos.'));
    }
  };

  return (
    <div className="login-container">
      <div className="login-card base-card">

        <div className="login-header">
          <span className="brand-symbol">▲</span>
          <h1 className="brand-name">stoqd</h1>
          <p>Entre com sua conta de cliente ou de administração.</p>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Telefone</label>
            {/* Um campo só para os dois tipos de conta: o cliente digita o
                telefone, a administração digita o e-mail do .env — que nunca
                vai casar com um número. */}
            <input
              type="text"
              className="input-standard"
              placeholder="(87) 90000-0000"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              className="input-standard"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary login-btn">
            Entrar
          </button>

        </form>

        <div className="login-footer">
          Ainda não tem conta? <Link to={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Criar conta</Link>
        </div>

      </div>
    </div>
  );
}
