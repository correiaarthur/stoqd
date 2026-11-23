import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { markMoreBelow } from '../utils/scrollFade';
import './MultiSelect.css';

export type MultiSelectOption = { name: string; count: number };

/** Duração do "enrolar" ao fechar; precisa bater com a animação no CSS. */
const CLOSE_MS = 180;

type MultiSelectProps = {
  /** Nome do filtro: "Marca", "Categoria". */
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Classe extra na raiz, para a página ajustar o formato do gatilho. */
  className?: string;
  /**
   * De que lado da pílula a lista se apoia: `start` começa na borda esquerda
   * dela, `end` termina na direita. Se não couber na tela, vira sozinha.
   */
  align?: 'start' | 'end';
};

/**
 * Menu suspenso de seleção múltipla para os filtros da vitrine.
 *
 * Fica aberto enquanto a pessoa marca: escolher três marcas não pode exigir
 * abrir o menu três vezes. Fecha com Esc, com clique fora ou saindo com Tab.
 *
 * Teclado no padrão de listbox: setas andam, Espaço/Enter marcam, Home/End
 * pulam para as pontas. O foco fica na lista e a opção ativa é anunciada por
 * `aria-activedescendant`, sem mover o foco de botão em botão.
 */
export function MultiSelect({ label, options, selected, onChange, className, align = 'start' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  // Fechar não desmonta na hora: o menu se enrola de volta antes de sumir.
  // Durante isso ele já conta como fechado para tudo (aria-expanded, foco).
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-lista`;
  const optionId = (i: number) => `${id}-opcao-${i}`;

  const isOpen = open && !closing;

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosing(false);
    setOpen(true);
  };

  const close = (returnFocus = true, instant = false) => {
    if (returnFocus) buttonRef.current?.focus();
    if (!open) return;
    if (instant) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setOpen(false);
      setClosing(false);
      return;
    }
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (rootRef.current?.contains(target)) return;
      // Clicar noutro menu de filtro: este some na hora. Enrolar enquanto o
      // outro desenrola deixaria as duas listas uma sobre a outra.
      const otherMenu = target.closest?.('.multiselect') !== null;
      close(false, otherMenu);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  useEffect(() => {
    if (isOpen) listRef.current?.focus();
  }, [isOpen]);

  // Ao abrir (e se as opções mudarem): a lista cortada ganha o desfoque da base.
  useLayoutEffect(() => {
    if (open) markMoreBelow(listRef.current);
  }, [open, options.length]);

  // Antes da pintura: confere se a lista cabe na tela do lado pedido e, se
  // não couber, apoia do outro lado. Sem estado — é só o atributo no DOM,
  // para não renderizar duas vezes a cada abertura.
  useLayoutEffect(() => {
    const pop = popoverRef.current;
    if (!open || !pop) return;
    pop.dataset.align = align;
    const r = pop.getBoundingClientRect();
    const margin = 8;
    if (align === 'start' && r.right > window.innerWidth - margin) pop.dataset.align = 'end';
    if (align === 'end' && r.left < margin) pop.dataset.align = 'start';
  }, [open, align]);

  // A opção ativa acompanha a rolagem da lista quando ela é maior que a caixa.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name]);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => Math.min(a + 1, last)); break;
      case 'ArrowUp': e.preventDefault(); setActive(a => Math.max(a - 1, 0)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        if (options[active]) toggle(options[active].name);
        break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
    }
  };

  const summary = selected.length === 0
    ? 'Todas'
    : selected.length === 1 ? selected[0] : `${selected.length} selecionadas`;

  return (
    <div className={`multiselect ${isOpen ? 'is-open' : ''} ${closing ? 'is-closing' : ''} ${selected.length > 0 ? 'has-value' : ''} ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="multiselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => (isOpen ? close() : openMenu())}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !isOpen) { e.preventDefault(); openMenu(); }
        }}
      >
        <span className="multiselect-label">{label}</span>
        <span className="multiselect-value">{summary}</span>
        <svg className="multiselect-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="multiselect-popover" ref={popoverRef} data-align={align}>
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
            tabIndex={-1}
            className="multiselect-list"
            onScroll={e => markMoreBelow(e.currentTarget)}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, i) => {
              const isSelected = selected.includes(option.name);
              return (
                <li
                  key={option.name}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  className={`multiselect-option ${i === active ? 'is-active' : ''}`}
                  // As opções descem uma depois da outra enquanto o menu desenrola.
                  style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => { setActive(i); toggle(option.name); }}
                >
                  <span className="multiselect-check" aria-hidden="true">
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>
                  <span className="multiselect-name">{option.name}</span>
                  <span className="multiselect-count">{option.count}</span>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <button type="button" className="multiselect-clear" onClick={() => { onChange([]); close(); }}>
              Limpar {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
