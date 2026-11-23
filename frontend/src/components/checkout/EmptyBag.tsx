import { Link } from 'react-router-dom';

export function EmptyBag({ admin }: { admin: boolean }) {
  return (
    <div className="base-card checkout-empty">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="checkout-empty-icon">
        <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>

      <div className="checkout-empty-text">
        <h2>Seu carrinho está vazio</h2>
        <p>
          {admin
            ? 'Escolha os produtos na vitrine para montar a venda.'
            : 'Escolha o que quiser na vitrine — o estoque fica reservado para você por 5 minutos assim que o primeiro item entrar aqui.'}
        </p>
      </div>

      <Link to="/" className="btn-primary">Ver a vitrine</Link>
    </div>
  );
}
