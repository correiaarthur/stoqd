import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Checkout } from './pages/Checkout';
import { Sales } from './pages/Sales';
import { Customers } from './pages/Customers'; 
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { MyAccount } from './pages/MyAccount';
import { Inventory } from './pages/Inventory';
import { Settings } from './pages/Settings';

import { isAdmin, isCustomer, isTokenValid } from './utils/auth';
import { CartProvider } from './contexts/CartProvider';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

/**
 * As rotas por papel existem para a pessoa não cair numa tela que não é dela —
 * quem realmente decide o que pode é o servidor, que responde 403 a token de
 * cliente em rota de admin.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isTokenValid()) return <Navigate to="/login" replace />;

  return isAdmin() ? <>{children}</> : <Navigate to="/" replace />;
}

function CustomerRoute({ children }: { children: React.ReactNode }) {
  if (!isTokenValid()) return <Navigate to="/login?next=/minha-conta" replace />;

  return isCustomer() ? <>{children}</> : <Navigate to="/" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
          <Header />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Register />} />

              {/* O checkout é público: o visitante monta o carrinho antes de
                  ter conta, e é a própria tela que pede o cadastro na hora de
                  enviar o pedido. */}
              <Route path="/checkout" element={<Checkout />} />

              <Route path="/minha-conta" element={<CustomerRoute><MyAccount /></CustomerRoute>} />

              <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
              <Route path="/estoque" element={<AdminRoute><Inventory /></AdminRoute>} />
              <Route path="/vendas" element={<AdminRoute><Sales /></AdminRoute>} />
              <Route path="/customers" element={<AdminRoute><Customers /></AdminRoute>} />
              <Route path="/ajustes" element={<AdminRoute><Settings /></AdminRoute>} />

              {/* O PDV virou o checkout: quem tiver o link antigo salvo cai no
                  lugar novo em vez de numa tela que não existe mais. */}
              <Route path="/pdv" element={<Navigate to="/checkout" replace />} />

              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </CartProvider>
    </BrowserRouter>
  );
}
export default App;
