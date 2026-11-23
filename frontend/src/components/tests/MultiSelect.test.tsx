import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MultiSelect } from '../MultiSelect';

/**
 * O filtro de marca e categoria da vitrine. Asserta por papel e texto, nunca
 * por classe: o que precisa sobreviver a um restyle é marcar várias opções sem
 * reabrir o menu, e fechar do jeito que a pessoa espera.
 */

const MARCAS = [
  { name: 'Avon', count: 2 },
  { name: 'Eudora', count: 3 },
  { name: 'Natura', count: 1 },
];

/** Com estado de verdade: o componente é controlado. */
function Controlado({ onChange = vi.fn(), inicial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(inicial);
  return (
    <>
      <MultiSelect label="Marca" options={MARCAS} selected={selected} onChange={next => { setSelected(next); onChange(next); }} />
      <button type="button">fora</button>
    </>
  );
}

const gatilho = () => screen.getByRole('button', { name: /^marca/i });

describe('MultiSelect', () => {
  it('fechado, mostra "Todas" e não expõe a lista', () => {
    render(<Controlado />);

    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
    expect(gatilho()).toHaveTextContent('Todas');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marca várias opções sem fechar o menu', async () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);

    await userEvent.click(gatilho());
    await userEvent.click(screen.getByRole('option', { name: /avon/i }));
    await userEvent.click(screen.getByRole('option', { name: /natura/i }));

    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('option', { name: /avon/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /natura/i })).toHaveAttribute('aria-selected', 'true');
    expect(onChange).toHaveBeenLastCalledWith(['Avon', 'Natura']);
    expect(gatilho()).toHaveTextContent('2 selecionadas');
  });

  it('clicar de novo desmarca', async () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} inicial={['Eudora']} />);

    await userEvent.click(gatilho());
    await userEvent.click(screen.getByRole('option', { name: /eudora/i }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('com uma escolha, o gatilho mostra o nome dela', () => {
    render(<Controlado inicial={['Natura']} />);
    expect(gatilho()).toHaveTextContent('Natura');
  });

  it('teclado: seta abre, setas andam, espaço marca, Esc fecha e devolve o foco', async () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);

    gatilho().focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}{ }');
    expect(onChange).toHaveBeenLastCalledWith(['Eudora']);

    await userEvent.keyboard('{Escape}');
    // Fecha na hora para quem pergunta (aria-expanded, foco); a lista sai do
    // DOM quando termina de se enrolar.
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
    expect(gatilho()).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('clique fora fecha', async () => {
    render(<Controlado />);

    await userEvent.click(gatilho());
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));

    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('"Limpar" só aparece com escolha, e zera tudo', async () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} inicial={['Avon', 'Natura']} />);

    await userEvent.click(gatilho());
    await userEvent.click(screen.getByRole('button', { name: /limpar marca/i }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(gatilho()).toHaveTextContent('Todas');
  });

  it('reabrir enquanto ainda está se enrolando cancela o fechamento', async () => {
    render(<Controlado />);

    await userEvent.click(gatilho());
    await userEvent.keyboard('{Escape}');
    await userEvent.click(gatilho());
    await new Promise(r => setTimeout(r, 250));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(gatilho()).toHaveAttribute('aria-expanded', 'true');
  });

  it('abrir outro menu fecha este na hora, sem esperar a animação', async () => {
    function Dois() {
      const [a, setA] = useState<string[]>([]);
      const [b, setB] = useState<string[]>([]);
      return (
        <>
          <MultiSelect label="Marca" options={MARCAS} selected={a} onChange={setA} />
          <MultiSelect label="Categoria" options={[{ name: 'Corpo', count: 1 }]} selected={b} onChange={setB} />
        </>
      );
    }
    render(<Dois />);

    await userEvent.click(screen.getByRole('button', { name: /^marca/i }));
    await userEvent.click(screen.getByRole('button', { name: /^categoria/i }));

    // Sem waitFor: a lista de marcas já não pode estar lá.
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
    expect(screen.getByRole('listbox')).toHaveAccessibleName('Categoria');
  });

  it('mostra quantos produtos há em cada opção', async () => {
    render(<Controlado />);

    await userEvent.click(gatilho());

    expect(screen.getByRole('option', { name: /eudora/i })).toHaveTextContent('3');
  });
});
