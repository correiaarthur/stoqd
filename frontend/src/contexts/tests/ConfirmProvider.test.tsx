import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '../ConfirmProvider';
import { useConfirm, type ConfirmOptions } from '../confirm';

/**
 * No lugar de `window.confirm()`: a pergunta vira uma promessa que resolve
 * `true` só se a pessoa confirmar. Qualquer outra saída — cancelar, Esc, clicar
 * fora, ser substituída por outra pergunta — resolve `false`.
 */

const apagar: ConfirmOptions = {
  title: 'Apagar o cliente?',
  message: 'Clientes com venda não podem ser apagados.\n\nNada será alterado nesse caso.',
  confirmLabel: 'Apagar',
  tone: 'danger',
};

/** Entrega a função do hook ao teste, por um efeito — render não faz efeito colateral. */
function Captura({ onReady }: { onReady: (confirm: (options: ConfirmOptions) => Promise<boolean>) => void }) {
  const confirm = useConfirm();
  useEffect(() => { onReady(confirm); }, [confirm, onReady]);
  return null;
}

/** Uma tela mínima: um botão que pergunta e mostra a resposta. */
function Tela({ options = apagar }: { options?: ConfirmOptions }) {
  const confirm = useConfirm();
  const [resposta, setResposta] = useState('nenhuma');

  return (
    <>
      <button onClick={async () => setResposta(String(await confirm(options)))}>abrir</button>
      <output>{resposta}</output>
    </>
  );
}

function montar(options?: ConfirmOptions) {
  const user = userEvent.setup();
  render(<ConfirmProvider><Tela {...(options ? { options } : {})} /></ConfirmProvider>);
  return user;
}

const resposta = () => screen.getByRole('status', { hidden: true }).textContent;

describe('ConfirmProvider', () => {
  it('não mostra nada até alguém perguntar', () => {
    montar();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('mostra título, parágrafos e os rótulos pedidos, como diálogo modal', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));

    const dialogo = screen.getByRole('alertdialog', { name: 'Apagar o cliente?' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleDescription(/Clientes com venda não podem ser apagados\./);

    expect(dialogo.querySelectorAll('.confirm-message p')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Apagar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('sem rótulos, usa Confirmar e Cancelar; sem mensagem, não há descrição', async () => {
    const user = montar({ title: 'Continuar?' });
    await user.click(screen.getByText('abrir'));

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).not.toHaveAttribute('aria-describedby');
  });

  it('o tom de perigo pinta o diálogo e o botão', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));

    expect(screen.getByRole('alertdialog')).toHaveClass('is-danger');
    expect(screen.getByRole('button', { name: 'Apagar' })).toHaveClass('confirm-danger');
  });

  it('confirmar resolve true e fecha', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));
    await user.click(screen.getByRole('button', { name: 'Apagar' }));

    expect(resposta()).toBe('true');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('cancelar resolve false e fecha', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(resposta()).toBe('false');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Esc resolve false', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));
    await user.keyboard('{Escape}');

    expect(resposta()).toBe('false');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('clicar fora resolve false; clicar dentro do diálogo não fecha', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));

    await user.click(screen.getByRole('alertdialog'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(document.querySelector('.confirm-overlay')!);
    expect(resposta()).toBe('false');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('o foco começa em Cancelar: um Enter distraído não confirma', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(resposta()).toBe('false');
  });

  it('o foco volta ao botão que abriu o diálogo', async () => {
    const user = montar();
    const abrir = screen.getByText('abrir');
    await user.click(abrir);
    await user.keyboard('{Escape}');

    expect(abrir).toHaveFocus();
  });

  it('o Tab circula entre os dois botões, nos dois sentidos', async () => {
    const user = montar();
    await user.click(screen.getByText('abrir'));
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    const apagarBtn = screen.getByRole('button', { name: 'Apagar' });

    await user.tab();
    expect(apagarBtn).toHaveFocus();

    await user.tab();
    expect(cancelar).toHaveFocus();

    await user.tab({ shift: true });
    expect(apagarBtn).toHaveFocus();
  });

  it('uma pergunta nova com outra aberta recusa a anterior', async () => {
    let perguntar!: (opcoes: ConfirmOptions) => Promise<boolean>;
    render(<ConfirmProvider><Captura onReady={(fn) => { perguntar = fn; }} /></ConfirmProvider>);

    let primeira!: Promise<boolean>;
    let segunda!: Promise<boolean>;
    act(() => { primeira = perguntar({ title: 'Primeira?' }); });
    act(() => { segunda = perguntar({ title: 'Segunda?' }); });

    await expect(primeira).resolves.toBe(false);
    expect(screen.getByRole('alertdialog', { name: 'Segunda?' })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar' }));
    await expect(segunda).resolves.toBe(true);
  });

  it('desmontar com a pergunta aberta não deixa a promessa pendurada', async () => {
    let perguntar!: (opcoes: ConfirmOptions) => Promise<boolean>;
    const { unmount } = render(<ConfirmProvider><Captura onReady={(fn) => { perguntar = fn; }} /></ConfirmProvider>);

    let pendente!: Promise<boolean>;
    act(() => { pendente = perguntar({ title: 'Ainda aí?' }); });
    unmount();

    await expect(pendente).resolves.toBe(false);
  });

  it('a função do hook tem identidade estável', () => {
    const vistos: unknown[] = [];
    function Espiao() { vistos.push(useConfirm()); return null; }

    const { rerender } = render(<ConfirmProvider><Espiao /></ConfirmProvider>);
    rerender(<ConfirmProvider><Espiao /></ConfirmProvider>);

    expect(new Set(vistos).size).toBe(1);
  });

  it('usar o hook fora do provider é erro claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Solto() { useConfirm(); return null; }

    expect(() => render(<Solto />)).toThrow(/ConfirmProvider/);
    vi.restoreAllMocks();
  });
});
