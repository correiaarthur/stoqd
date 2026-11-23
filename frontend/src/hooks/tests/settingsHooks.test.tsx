import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  getInstallmentPlans: vi.fn(),
  saveInstallmentPlans: vi.fn(),
  listCoupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
}));

vi.mock('../../services/settings', () => services);

import type { Coupon, Plan } from '../../components/settings/types';
import { NEW_HIGHLIGHT_MS, useCoupons } from '../useCoupons';
import { useInstallmentPlans } from '../useInstallmentPlans';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

const faixas = (): Plan[] => [
  { installments: 2, interestPercent: 0, active: true },
  { installments: 3, interestPercent: 0, active: true },
  { installments: 4, interestPercent: 5, active: false },
];

describe('useInstallmentPlans', () => {
  it('carrega as faixas e guarda uma cópia do que está salvo', async () => {
    services.getInstallmentPlans.mockResolvedValue({ data: faixas() });
    const { result } = renderHook(() => useInstallmentPlans());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.plans).toEqual(faixas());
    expect(result.current.saved).toEqual(faixas());
    expect(result.current.maxActive).toBe(3);
  });

  it('mexer na taxa muda só aquela faixa e não mexe no que está salvo', async () => {
    services.getInstallmentPlans.mockResolvedValue({ data: faixas() });
    const { result } = renderHook(() => useInstallmentPlans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patch(3, { interestPercent: 2.5 }));

    expect(result.current.plans.find(p => p.installments === 3)!.interestPercent).toBe(2.5);
    expect(result.current.plans.find(p => p.installments === 2)!.interestPercent).toBe(0);
    expect(result.current.saved.find(p => p.installments === 3)!.interestPercent).toBe(0);
  });

  it('mudar o limite liga as faixas até ele e desliga as de cima', async () => {
    services.getInstallmentPlans.mockResolvedValue({ data: faixas() });
    const { result } = renderHook(() => useInstallmentPlans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setLimit(4));
    expect(result.current.plans.map(p => p.active)).toEqual([true, true, true]);
    expect(result.current.maxActive).toBe(4);

    act(() => result.current.setLimit(2));
    expect(result.current.plans.map(p => p.active)).toEqual([true, false, false]);
    expect(result.current.maxActive).toBe(2);
  });

  it('salvar manda a tabela toda, atualiza o salvo e avisa', async () => {
    services.getInstallmentPlans.mockResolvedValue({ data: faixas() });
    const { result } = renderHook(() => useInstallmentPlans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patch(2, { interestPercent: 1 }));
    const aposSalvar = [{ installments: 2, interestPercent: 1, active: true }];
    services.saveInstallmentPlans.mockResolvedValue({ data: aposSalvar });

    await act(async () => { await result.current.save(); });

    expect(services.saveInstallmentPlans).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ installments: 2, interestPercent: 1 }),
    ]));
    expect(result.current.saved).toEqual(aposSalvar);
    expect(result.current.message).toBe('Parcelamento salvo.');
    expect(result.current.isSaving).toBe(false);
  });

  it('salvar com erro mostra a mensagem da API e mantém o que foi editado', async () => {
    services.getInstallmentPlans.mockResolvedValue({ data: faixas() });
    const { result } = renderHook(() => useInstallmentPlans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patch(2, { interestPercent: 9 }));
    services.saveInstallmentPlans.mockRejectedValue(new Error('rede'));

    await act(async () => { await result.current.save(); });

    expect(result.current.error).toBe('Não foi possível salvar.');
    expect(result.current.plans[0]!.interestPercent).toBe(9);
    expect(result.current.isSaving).toBe(false);
  });

  it('falha ao carregar libera o loading em vez de ficar no esqueleto', async () => {
    services.getInstallmentPlans.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useInstallmentPlans());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plans).toEqual([]);
  });
});

const cupom = (over: Partial<Coupon> = {}): Coupon => ({
  id: 1, code: 'CICLO10', type: 'PERCENT', value: 10, minimumTotal: null, expiresAt: null,
  maxUses: null, usedCount: 0, active: true, status: 'active', ...over,
});

async function montarCupons(lista: Coupon[] = [cupom({ id: 1 }), cupom({ id: 3, code: 'NOVO' }), cupom({ id: 2, code: 'MEIO', active: false, status: 'inactive' })]) {
  services.listCoupons.mockResolvedValue({ data: lista });
  const hook = renderHook(() => useCoupons());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useCoupons', () => {
  it('lista do mais novo para o mais antigo e conta os que estão valendo', async () => {
    const { result } = await montarCupons();

    expect(result.current.sorted.map(c => c.id)).toEqual([3, 2, 1]);
    expect(result.current.activeCount).toBe(2);
  });

  it('escolher um cupom traz os dados dele para o formulário, em texto', async () => {
    const { result } = await montarCupons([cupom({ id: 5, type: 'FIXED', value: 20, minimumTotal: 100, expiresAt: '2026-09-30T00:00:00.000Z', maxUses: 50 })]);

    act(() => result.current.startEdit(result.current.coupons[0]!));

    expect(result.current.editingId).toBe(5);
    expect(result.current.form).toEqual({
      code: 'CICLO10', type: 'FIXED', value: '20', minimumTotal: '100', expiresAt: '2026-09-30', maxUses: '50',
    });
  });

  it('campos opcionais vazios no cupom viram texto vazio no formulário', async () => {
    const { result } = await montarCupons([cupom()]);
    act(() => result.current.startEdit(result.current.coupons[0]!));

    expect(result.current.form).toMatchObject({ minimumTotal: '', expiresAt: '', maxUses: '' });
  });

  it('criar manda os campos convertidos, destaca o novo, avisa e limpa o formulário', async () => {
    const { result } = await montarCupons([]);
    services.createCoupon.mockResolvedValue({ data: { id: 9 } });

    act(() => result.current.setForm({ code: 'BEMVINDO', type: 'PERCENT', value: '15', minimumTotal: '', expiresAt: '', maxUses: '3' }));
    await act(async () => { await result.current.submit({ preventDefault() {} } as never); });

    expect(services.createCoupon).toHaveBeenCalledWith({
      code: 'BEMVINDO', type: 'PERCENT', value: 15, minimumTotal: null, expiresAt: null, maxUses: 3,
    });
    expect(result.current.newId).toBe(9);
    expect(result.current.message).toBe('Cupom criado.');
    expect(result.current.form.code).toBe('');
    expect(services.listCoupons).toHaveBeenCalledTimes(2);
  });

  it('o destaque do cupom novo some sozinho', async () => {
    // Antes de montar: o relógio falso precisa existir quando o timer é criado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await montarCupons([]);
    services.createCoupon.mockResolvedValue({ data: { id: 9 } });
    await act(async () => { await result.current.submit({ preventDefault() {} } as never); });
    expect(result.current.newId).toBe(9);

    act(() => { vi.advanceTimersByTime(NEW_HIGHLIGHT_MS - 100); });
    expect(result.current.newId).toBe(9);

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.newId).toBeNull();
  });

  it('editar um cupom existente atualiza em vez de criar', async () => {
    const { result } = await montarCupons([cupom({ id: 4 })]);
    services.updateCoupon.mockResolvedValue({});

    act(() => result.current.startEdit(result.current.coupons[0]!));
    await act(async () => { await result.current.submit({ preventDefault() {} } as never); });

    expect(services.updateCoupon).toHaveBeenCalledWith(4, expect.objectContaining({ code: 'CICLO10', value: 10 }));
    expect(services.createCoupon).not.toHaveBeenCalled();
    expect(result.current.message).toBe('Cupom atualizado.');
    expect(result.current.editingId).toBeNull();
  });

  it('erro ao salvar fica no formulário, que continua preenchido', async () => {
    const { result } = await montarCupons([]);
    services.createCoupon.mockRejectedValue(new Error('rede'));

    act(() => result.current.setForm({ ...result.current.form, code: 'X' }));
    await act(async () => { await result.current.submit({ preventDefault() {} } as never); });

    expect(result.current.formError).toBe('Não foi possível salvar o cupom.');
    expect(result.current.form.code).toBe('X');
    expect(result.current.isSaving).toBe(false);
  });

  it('desligar manda o cupom inteiro com `active` invertido', async () => {
    const { result } = await montarCupons([cupom({ id: 7, expiresAt: '2026-12-31T00:00:00.000Z', minimumTotal: 50 })]);
    services.updateCoupon.mockResolvedValue({});

    await act(async () => { await result.current.toggle(result.current.coupons[0]!); });

    expect(services.updateCoupon).toHaveBeenCalledWith(7, {
      code: 'CICLO10', type: 'PERCENT', value: 10, minimumTotal: 50, expiresAt: '2026-12-31', maxUses: null, active: false,
    });
  });

  it('apagar um cupom já usado mostra o aviso da API (foi desativado, não apagado)', async () => {
    const { result } = await montarCupons([cupom({ id: 7 })]);
    services.deleteCoupon.mockResolvedValue({ data: { message: 'Foi desativado em vez de apagado.' } });

    await act(async () => { await result.current.remove(result.current.coupons[0]!); });

    expect(result.current.listError).toBe('Foi desativado em vez de apagado.');
  });

  it('apagar o cupom que está sendo editado limpa o formulário', async () => {
    const { result } = await montarCupons([cupom({ id: 7 })]);
    services.deleteCoupon.mockResolvedValue({ data: undefined });

    act(() => result.current.startEdit(result.current.coupons[0]!));
    await act(async () => { await result.current.remove(result.current.coupons[0]!); });

    expect(result.current.editingId).toBeNull();
    expect(result.current.form.code).toBe('');
  });

  it('erro ao apagar mostra a mensagem na lista', async () => {
    const { result } = await montarCupons([cupom()]);
    services.deleteCoupon.mockRejectedValue(new Error('rede'));

    await act(async () => { await result.current.remove(result.current.coupons[0]!); });

    expect(result.current.listError).toBe('Não foi possível apagar o cupom.');
  });
});
