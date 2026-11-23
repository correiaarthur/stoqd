import './Footer.css';

/** Rodapé da loja: o nome grande em areia sobre tinta. */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="store-footer">
      <div className="store-footer-inner">
        <span className="store-footer-name" aria-hidden="true">stoqd</span>
        <div className="store-footer-text">
          <p>Gestão de estoque de cosméticos, feita para quem atende no balcão.</p>
          <p className="store-footer-small">© {currentYear} stoqd · Feito para Iarinha.</p>
          <nav aria-label="Contato do desenvolvedor" className="store-footer-dev">
            <span>Dev:</span>
            <a href="mailto:arthurcorreialeite@gmail.com">E-mail</a>
            <a href="https://www.linkedin.com/in/arthur-correia-b7b883222/" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://github.com/ArthurCorreiaa" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
