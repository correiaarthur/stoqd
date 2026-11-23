import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DropdownMenu } from '../DropdownMenu';

/**
 * O seletor de marca e categoria: escolher, procurar, criar, renomear, apagar —
 * tudo sem sair do cadastro do produto.
 *
 * É um dos três lugares com o mesmo `handleClickOutside` escrito à mão, e vai ser
 * o primeiro a usar o `useClickOutside` quando ele existir. Este teste é o que
 * permite extrair o hook sabendo se o comportamento sobreviveu.
 *
 * Um aviso que o teste deixa explícito: o gatilho é uma `<div>` com `onClick`,
 * não um `<button>`. Então ele não aparece em `getByRole('button')` e não responde
 * a teclado. Enquanto for assim, a busca é por texto.
 */

const ITENS = [
  { id: 1, name: 'Eudora' },
  { id: 2, name: 'Natura' },
  { id: 3, name: 'Avon' },
];

function montar(over: Partial<Parameters<typeof DropdownMenu>[0]> = {}) {
  const props = {
    label: 'Marca',
    items: ITENS,
    selectedId: '',
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...over,
  };

  return { ...render(<DropdownMenu {...props} />), props };
}

const abrir = () => userEvent.click(screen.getByText('Selecione...'));

describe('abrir e fechar', () => {
  it('começa fechado', () => {
    montar();
    expect(screen.queryByPlaceholderText(/procurar ou criar/i)).not.toBeInTheDocument();
  });

  it('mostra o placeholder quando nada está escolhido', () => {
    montar();
    expect(screen.getByText('Selecione...')).toBeInTheDocument();
  });

  it('mostra o nome do item escolhido', () => {
    montar({ selectedId: '2' });
    expect(screen.getByText('Natura')).toBeInTheDocument();
  });

  it('aceita selectedId como número ou string', () => {
    // O pai passa `Number(form.brandId)` em alguns lugares e string em outros.
    montar({ selectedId: 2 as unknown as string });
    expect(screen.getByText('Natura')).toBeInTheDocument();
  });

  it('abre a lista ao clicar', async () => {
    montar();
    await abrir();

    expect(screen.getByPlaceholderText(/procurar ou criar/i)).toBeInTheDocument();
    for (const item of ITENS) expect(screen.getByText(item.name)).toBeInTheDocument();
  });

  it('fecha ao clicar fora', async () => {
    // O comportamento que o `useClickOutside` vai ter que preservar.
    montar();
    await abrir();
    expect(screen.getByPlaceholderText(/procurar ou criar/i)).toBeInTheDocument();

    await userEvent.click(document.body);

    expect(screen.queryByPlaceholderText(/procurar ou criar/i)).not.toBeInTheDocument();
  });

  it('não fecha ao clicar dentro', async () => {
    montar();
    await abrir();

    await userEvent.click(screen.getByPlaceholderText(/procurar ou criar/i));

    expect(screen.getByPlaceholderText(/procurar ou criar/i)).toBeInTheDocument();
  });
});

describe('escolher', () => {
  it('avisa o pai com o id como string e fecha', async () => {
    const { props } = montar();
    await abrir();

    await userEvent.click(screen.getByText('Natura'));

    expect(props.onSelect).toHaveBeenCalledWith('2');
    expect(screen.queryByPlaceholderText(/procurar ou criar/i)).not.toBeInTheDocument();
  });

  it('a busca é limpa depois de escolher', async () => {
    montar();
    await abrir();
    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'Nat');
    await userEvent.click(screen.getByText('Natura'));

    await abrir();
    expect(screen.getByPlaceholderText(/procurar ou criar/i)).toHaveValue('');
  });
});

describe('procurar', () => {
  it('filtra sem distinguir maiúscula', async () => {
    montar();
    await abrir();

    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'nat');

    expect(screen.getByText('Natura')).toBeInTheDocument();
    expect(screen.queryByText('Eudora')).not.toBeInTheDocument();
  });

  it('oferece criar o que não existe', async () => {
    montar();
    await abrir();

    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'Boticário');

    expect(screen.getByText(/criar "Boticário"/i)).toBeInTheDocument();
  });

  it('não oferece criar o que já existe, mesmo com outra caixa', async () => {
    // Evita duas marcas "Natura" e "natura" — e a marca não tem @unique no
    // banco hoje (achado A9), então esta é a única barreira que existe.
    montar();
    await abrir();

    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'natura');

    expect(screen.queryByText(/criar "natura"/i)).not.toBeInTheDocument();
  });

  it('criar chama o pai e limpa a busca', async () => {
    const { props } = montar();
    await abrir();
    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'Boticário');

    await userEvent.click(screen.getByText(/criar "Boticário"/i));

    expect(props.onCreate).toHaveBeenCalledWith('Boticário');
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/procurar ou criar/i)).toHaveValue('');
    });
  });
});

describe('renomear', () => {
  it('o lápis abre o campo com o nome atual', async () => {
    montar();
    await abrir();

    await userEvent.click(screen.getAllByTitle('Editar')[1]!);

    expect(screen.getByDisplayValue('Natura')).toBeInTheDocument();
  });

  it('Enter salva', async () => {
    const { props } = montar();
    await abrir();
    await userEvent.click(screen.getAllByTitle('Editar')[1]!);

    // O campo é capturado antes de limpar: depois do `clear` ele não tem mais
    // valor para procurar por ele, e `getByRole('textbox')` é ambíguo porque a
    // busca também é um textbox. Nenhum dos dois tem rótulo acessível — vale
    // anotar para a refatoração visual: um `aria-label` resolveria.
    const campo = screen.getByDisplayValue('Natura');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Natura Brasil{Enter}');

    expect(props.onUpdate).toHaveBeenCalledWith(2, 'Natura Brasil');
  });

  it('Escape desiste sem salvar', async () => {
    const { props } = montar();
    await abrir();
    await userEvent.click(screen.getAllByTitle('Editar')[1]!);

    await userEvent.type(screen.getByDisplayValue('Natura'), '{Escape}');

    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('clicar no item em modo de edição não o seleciona', async () => {
    // Senão renomear fecharia a lista no meio da digitação.
    const { props } = montar();
    await abrir();
    await userEvent.click(screen.getAllByTitle('Editar')[1]!);

    await userEvent.click(screen.getByDisplayValue('Natura'));

    expect(props.onSelect).not.toHaveBeenCalled();
  });
});

describe('apagar', () => {
  it('a lixeira chama o pai com o id', async () => {
    const { props } = montar();
    await abrir();

    await userEvent.click(screen.getAllByTitle('Excluir')[2]!);

    expect(props.onDelete).toHaveBeenCalledWith(3);
  });

  it('apagar não seleciona o item', async () => {
    const { props } = montar();
    await abrir();

    await userEvent.click(screen.getAllByTitle('Excluir')[0]!);

    expect(props.onSelect).not.toHaveBeenCalled();
  });
});

describe('lista vazia', () => {
  it('abre sem quebrar e só oferece criar', async () => {
    montar({ items: [] });
    await abrir();

    await userEvent.type(screen.getByPlaceholderText(/procurar ou criar/i), 'Primeira');
    expect(screen.getByText(/criar "Primeira"/i)).toBeInTheDocument();
  });
});
