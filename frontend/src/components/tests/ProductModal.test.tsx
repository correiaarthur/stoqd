import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = vi.hoisted(() => ({
  listBrands: vi.fn(),
  listCategories: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  requestProductImageUpload: vi.fn(),
  taxonomy: { create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../services/catalog', () => catalog);
vi.mock('../../contexts/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../contexts/confirm', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: vi.fn() } } }));

import { ProductModal } from '../ProductModal';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  catalog.listBrands.mockResolvedValue({ data: [{ id: 1, name: 'Natura' }, { id: 2, name: 'Boticário' }] });
  catalog.listCategories.mockResolvedValue({ data: [{ id: 10, name: 'Perfumaria' }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function montar() {
  return render(<ProductModal productToEdit={null} onClose={vi.fn()} onSuccess={vi.fn()} />);
}

/** O menu de "Marca" ou "Categoria", pelo rótulo. */
const menu = (label: string) => within(screen.getByText(label, { selector: 'label' }).closest('.form-group') as HTMLElement);

describe('ProductModal — marcas e categorias', () => {
  it('carrega as duas listas uma vez só, ao abrir', async () => {
    montar();

    await waitFor(() => expect(catalog.listBrands).toHaveBeenCalledTimes(1));
    expect(catalog.listCategories).toHaveBeenCalledTimes(1);
  });

  it('o menu de marca oferece as marcas, e o de categoria, as categorias', async () => {
    montar();
    const user = userEvent.setup();
    await waitFor(() => expect(catalog.listBrands).toHaveBeenCalled());

    await user.click(menu('Marca').getByText('Selecione...'));
    expect(await menu('Marca').findByText('Natura')).toBeInTheDocument();
    expect(menu('Marca').getByText('Boticário')).toBeInTheDocument();

    await user.click(menu('Categoria').getByText('Selecione...'));
    expect(await menu('Categoria').findByText('Perfumaria')).toBeInTheDocument();
  });

  it('criar uma marca pelo menu a envia ao servidor e recarrega a lista', async () => {
    catalog.taxonomy.create.mockResolvedValue({});
    montar();
    const user = userEvent.setup();
    await waitFor(() => expect(catalog.listBrands).toHaveBeenCalledTimes(1));

    catalog.listBrands.mockResolvedValue({
      data: [{ id: 1, name: 'Natura' }, { id: 2, name: 'Boticário' }, { id: 3, name: 'Eudora' }],
    });

    await user.click(menu('Marca').getByText('Selecione...'));
    await user.type(menu('Marca').getByPlaceholderText('Procurar ou criar...'), 'Eudora');
    await user.click(menu('Marca').getByText('Criar "Eudora"'));

    expect(catalog.taxonomy.create).toHaveBeenCalledWith('brands', 'Eudora');
    await waitFor(() => expect(catalog.listBrands).toHaveBeenCalledTimes(2));
    expect(await menu('Marca').findByText('Eudora')).toBeInTheDocument();
  });

  it('se as listas não carregam, o formulário continua utilizável', async () => {
    catalog.listBrands.mockRejectedValue(new Error('rede'));
    montar();

    await waitFor(() => expect(catalog.listBrands).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(menu('Marca').getByText('Selecione...')).toBeInTheDocument();
  });
});
