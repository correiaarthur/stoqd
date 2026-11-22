import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import { AdminSidebar } from './components/AdminSidebar';

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

/**
 * Duas moradas para o mesmo app. Quem administra trabalha dentro da barra
 * lateral — inclusive na vitrine, que para o balcão é a tela de vender. Quem
 * compra vê a loja: cabeçalho, conteúdo e rodapé.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  // Entrar e Criar conta são telas inteiras, com painel próprio: sem o
  // cabeçalho nem o rodapé da loja em volta.
  if (pathname === '/login' || pathname === '/cadastro') return <>{children}</>;

  if (isTokenValid() && isAdmin()) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="store-layout">
      <Header />
      <main className="store-main">{children}</main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Shell>
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
        </Shell>
      </CartProvider>
    </BrowserRouter>
  );
}
export default App;
