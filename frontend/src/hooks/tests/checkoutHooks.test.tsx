import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Customer } from '../useCustomers';
import { useCustomerPicker } from '../useCustomerPicker';
import { useDiscountInput } from '../useDiscountInput';

describe('useDiscountInput', () => {
  it('em reais, o que se digita é o desconto', () => {
    const { result } = renderHook(() => useDiscountInput(200));

    act(() => result.current.onInputChange('1000')); // o campo de dinheiro lê centavos: 10,00

    expect(result.current.input).toBe('10.00');
    expect(result.current.rawInReais).toBe(10);
    expect(result.current.inReais).toBe(10);
  });

  it('em porcentagem, é a fração do total dos produtos', () => {
    const { result } = renderHook(() => useDiscountInput(200));

    act(() => result.current.setType('percentage'));
    act(() => result.current.onInputChange('15'));

    expect(result.current.rawInReais).toBe(30);
    expect(result.current.inReais).toBe(30);
  });

  it('o desconto aplicado nunca passa do total; o digitado continua visível', () => {
    const { result } = renderHook(() => useDiscountInput(50));

    act(() => result.current.onInputChange('9000')); // 90,00 num pedido de 50

    expect(result.current.rawInReais).toBe(90);
    expect(result.current.inReais).toBe(50);
  });

  it('trocar R$ por % limpa o campo: o número não significa o mesmo', () => {
    const { result } = renderHook(() => useDiscountInput(200));

    act(() => result.current.onInputChange('1000'));
    act(() => result.current.setType('percentage'));

    expect(result.current.input).toBe('');
    expect(result.current.rawInReais).toBe(0);
  });

  it('porcentagem acima de 100 é cortada em 100', () => {
    const { result } = renderHook(() => useDiscountInput(80));

    act(() => result.current.setType('percentage'));
    act(() => result.current.onInputChange('250'));

    expect(result.current.input).toBe('100');
    expect(result.current.inReais).toBe(80);
  });

  it('reset volta ao campo vazio, em reais', () => {
    const { result } = renderHook(() => useDiscountInput(200));

    act(() => result.current.setType('percentage'));
    act(() => result.current.onInputChange('10'));
    act(() => result.current.reset());

    expect(result.current.input).toBe('');
    expect(result.current.type).toBe('fixed');
  });
});

const cliente = (id: number, name: string): Customer =>
  ({ id, name, phone: null, email: null, totalDebt: 0, pendingSalesCount: 0, hasOverdue: false });

describe('useCustomerPicker', () => {
  const lista = [cliente(1, 'Ana Ribeiro'), cliente(2, 'Bruno Carvalho'), cliente(3, 'Carla Monteiro')];

  it('começa sem ninguém escolhido e com a lista inteira', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    expect(result.current.selectedId).toBe('');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.filtered).toHaveLength(3);
  });

  it('digitar filtra sem diferenciar maiúscula e abre a lista', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    act(() => result.current.type('CAR'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.filtered.map(c => c.name)).toEqual(['Bruno Carvalho', 'Carla Monteiro']);
  });

  it('escolher grava o id, põe o nome na caixa e fecha a lista', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    act(() => result.current.type('an'));
    act(() => result.current.select('1', 'Ana Ribeiro'));

    expect(result.current.selectedId).toBe('1');
    expect(result.current.searchText).toBe('Ana Ribeiro');
    expect(result.current.isOpen).toBe(false);
  });

  it('digitar depois de escolher desfaz a escolha', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    act(() => result.current.select('1', 'Ana Ribeiro'));
    act(() => result.current.type('Ana Ribeir'));

    expect(result.current.selectedId).toBe('');
  });

  it('"Consumidor final" é escolher id vazio com texto vazio', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    act(() => result.current.select('2', 'Bruno Carvalho'));
    act(() => result.current.select('', ''));

    expect(result.current.selectedId).toBe('');
    expect(result.current.searchText).toBe('');
  });

  it('reset limpa a escolha e o texto, e close fecha a lista', () => {
    const { result } = renderHook(() => useCustomerPicker(lista));

    act(() => result.current.select('3', 'Carla Monteiro'));
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.reset());
    expect(result.current.selectedId).toBe('');
    expect(result.current.searchText).toBe('');
  });
});
