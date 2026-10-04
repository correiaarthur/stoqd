import { useState, useEffect } from 'react';
import { api } from '../api';

/** Os dados de contato, que toda resposta de cliente traz. */
export interface CustomerRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

/**
 * Cliente como a **listagem** recebe: o contato mais o resumo da dívida que o
 * servidor soma a partir das parcelas em aberto.
 *
 * Só o `GET /customers` calcula esses três campos. O `POST` devolve a linha
 * recém-criada e nada mais — por isso ele é `CustomerRecord`, e quem insere o
 * novo cliente na lista precisa completar o resumo (que, para quem acabou de
 * ser cadastrado, é zerado).
 *
 * O histórico de compras não vem aqui: é o `getStatement`, carregado só quando
 * um cliente é aberto.
 */
export interface Customer extends CustomerRecord {
  totalDebt: number;
  pendingSalesCount: number;
  hasOverdue: boolean;
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get<Customer[]>('/customers');
      setCustomers(res.data || []);
    } catch (err) {
      console.error("Erro ao buscar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  return { customers, setCustomers, loading, refetchCustomers: fetchCustomers };
}

/** Uma parcela da venda a prazo. `paidAt` nulo é o que define "em aberto". */
export interface Installment {
  id: number;
  number: number;
  value: number;
  dueDate: string;
  paidAt: string | null;
  saleId: number;
}

export interface StatementSaleItem {
  id: number;
  quantity: number;
  unitPrice: number;
  productId: number;
  product: { name: string } | null;
}

export interface StatementSale {
  id: number;
  total: number;
  /** A venda guarda `date`, não `createdAt`. */
  date: string;
  observation: string | null;
  discount: number | null;
  interest: number | null;
  installments: Installment[];
  items: StatementSaleItem[];
}

/** Resposta de `GET /customers/:id/statement`: o contato mais o histórico. */
export interface CustomerStatement extends CustomerRecord {
  sales: StatementSale[];
}
