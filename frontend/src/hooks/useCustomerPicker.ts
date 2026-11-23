import { useCallback, useState } from 'react';

import type { Customer } from './useCustomers';

/**
 * A busca de cliente do balcão: digita para filtrar, escolhe da lista ou deixa
 * em "Consumidor final".
 *
 * `selectedId` é `''` quando ninguém foi escolhido. Digitar depois de escolher
 * desfaz a escolha: o texto na caixa deixou de ser o nome do cliente.
 */
export function useCustomerPicker(customers: Customer[]) {
  const [selectedId, setSelectedId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  const select = (id: string, name: string) => {
    setSelectedId(id);
    setSearchText(name);
    setIsOpen(false);
  };

  const type = (text: string) => {
    setSearchText(text);
    setIsOpen(true);
    if (selectedId) setSelectedId('');
  };

  const reset = () => {
    setSelectedId('');
    setSearchText('');
  };

  const filtered = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return { selectedId, searchText, isOpen, open: () => setIsOpen(true), close, filtered, select, type, reset };
}

export type CustomerPicker = ReturnType<typeof useCustomerPicker>;
