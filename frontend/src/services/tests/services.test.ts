import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}));

vi.mock('../../api', () => ({ api: calls }));

import { taxonomy, fetchShowcase, requestProductImageUpload } from '../catalog';
import { payInstallment } from '../customers';
import { cancelOrder, listOrders } from '../orders';
import { changePassword } from '../account';
import { releaseCart } from '../checkout';

beforeEach(() => vi.clearAllMocks());

describe('taxonomy', () => {
  it('marca e categoria usam o mesmo CRUD, trocando só o recurso', () => {
    taxonomy.create('brands', 'Nova');
    taxonomy.rename('categories', 7, 'Bebidas');
    taxonomy.remove('brands', 3);

    expect(calls.post).toHaveBeenCalledWith('/brands', { name: 'Nova' });
    expect(calls.put).toHaveBeenCalledWith('/categories/7', { name: 'Bebidas' });
    expect(calls.delete).toHaveBeenCalledWith('/brands/3');
  });
});

describe('endereços', () => {
  it('pagar parcela não manda corpo: a data é do servidor', () => {
    payInstallment(12);
    expect(calls.patch).toHaveBeenCalledWith('/installments/12/pay');
  });

  it('showcase repassa os parâmetros repetidos como vieram', () => {
    const params = new URLSearchParams();
    params.append('brand', 'A');
    params.append('brand', 'B');

    fetchShowcase(params);
    expect(calls.get).toHaveBeenCalledWith('/products/showcase', { params });
  });

  it('pedido: lista por situação e recusa com motivo', () => {
    listOrders('PENDING');
    cancelOrder(5, 'Sem estoque');

    expect(calls.get).toHaveBeenCalledWith('/orders', { params: { status: 'PENDING' } });
    expect(calls.post).toHaveBeenCalledWith('/orders/5/cancel', { reason: 'Sem estoque' });
  });

  it('upload pede a assinatura com tipo e tamanho do arquivo', () => {
    requestProductImageUpload({ type: 'image/png', size: 1234 });
    expect(calls.post).toHaveBeenCalledWith('/uploads/product-image', { contentType: 'image/png', size: 1234 });
  });

  it('troca de senha e liberação de carrinho', () => {
    changePassword('velha', 'nova-senha');
    releaseCart('tok');

    expect(calls.put).toHaveBeenCalledWith('/me/password', { currentPassword: 'velha', newPassword: 'nova-senha' });
    expect(calls.post).toHaveBeenCalledWith('/cart/release', { cartToken: 'tok' });
  });
});
