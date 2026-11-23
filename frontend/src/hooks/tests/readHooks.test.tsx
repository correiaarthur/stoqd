import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  listSales: vi.fn(),
  listOrders: vi.fn(),
  getPaymentOptions: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.mock('../../services/orders', () => ({ listSales: services.listSales, listOrders: services.listOrders }));
vi.mock('../../services/checkout', () => ({ getPaymentOptions: services.getPaymentOptions }));
vi.mock('../../services/customers', () => ({ listCustomers: services.listCustomers }));

import { useCustomers } from '../useCustomers';
import { usePaymentOptions } from '../usePaymentOptions';
import { usePendingOrders } from '../usePendingOrders';
import { useSalesList } from '../useSalesList';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('useSalesList', () => {
  it('busca pelo período e busca de novo quando o período muda', async () => {
    services.listSales.mockResolvedValue({ data: [{ id: 1 }] });
    const abril = new Date('2026-04-01T00:00:00.000Z');
    const maio = new Date('2026-05-01T00:00:00.000Z');

    const { result, rerender } = renderHook(({ from }) => useSalesList(from), { initialProps: { from: abril } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(services.listSales).toHaveBeenLastCalledWith({ from: abril.toISOString(), limit: 200 });
    expect(result.current.sales).toEqual([{ id: 1 }]);

    rerender({ from: maio });
    await waitFor(() => expect(services.listSales).toHaveBeenLastCalledWith({ from: maio.toISOString(), limit: 200 }));
    expect(services.listSales).toHaveBeenCalledTimes(2);
  });

  it('um mesmo instante em outro objeto Date não busca de novo', async () => {
    services.listSales.mockResolvedValue({ data: [] });
    const { result, rerender } = renderHook(({ from }) => useSalesList(from), {
      initialProps: { from: new Date('2026-04-01T00:00:00.000Z') },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ from: new Date('2026-04-01T00:00:00.000Z') });

    expect(services.listSales).toHaveBeenCalledTimes(1);
  });

  it('resposta sem corpo vira lista vazia', async () => {
    services.listSales.mockResolvedValue({ data: null });
    const { result } = renderHook(() => useSalesList(new Date()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sales).toEqual([]);
  });
});

describe('usePaymentOptions', () => {
  it('arredonda o total para centavos antes de pedir', async () => {
    services.getPaymentOptions.mockResolvedValue({ data: { upfront: { total: 10.35 }, installmentOptions: [] } });
    const { result } = renderHook(() => usePaymentOptions(10.349999999));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(services.getPaymentOptions).toHaveBeenCalledWith(10.35);
    expect(result.current.options).toEqual({ upfront: { total: 10.35 }, installmentOptions: [] });
  });

  it('na falha as opções somem, em vez de ficarem as do total anterior', async () => {
    services.getPaymentOptions
      .mockResolvedValueOnce({ data: { upfront: { total: 50 }, installmentOptions: [] } })
      .mockRejectedValueOnce(new Error('rede'));

    const { result, rerender } = renderHook(({ total }) => usePaymentOptions(total), { initialProps: { total: 50 } });
    await waitFor(() => expect(result.current.options).not.toBeNull());

    rerender({ total: 80 });
    await waitFor(() => expect(result.current.options).toBeNull());
    expect(result.current.loading).toBe(false);
  });
});

describe('useCustomers', () => {
  it('expõe setCustomers para o checkout inserir o cliente recém-criado', async () => {
    services.listCustomers.mockResolvedValue({ data: [{ id: 1, name: 'Ana' }] });
    const { result } = renderHook(() => useCustomers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.setCustomers(prev => [...prev, { id: 2, name: 'Beto' } as never]);

    await waitFor(() => expect(result.current.customers).toHaveLength(2));
    expect(services.listCustomers).toHaveBeenCalledTimes(1);
  });
});

describe('usePendingOrders', () => {
  it('busca os pendentes e expõe refetch', async () => {
    services.listOrders.mockResolvedValue({ data: [{ id: 7 }] });
    const { result } = renderHook(() => usePendingOrders());
    await waitFor(() => expect(result.current.orders).toEqual([{ id: 7 }]));

    expect(services.listOrders).toHaveBeenCalledWith('PENDING');
    expect(typeof result.current.refetch).toBe('function');
  });
});
