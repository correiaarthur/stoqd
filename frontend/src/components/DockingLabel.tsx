import { useEffect, useId, useRef } from 'react';
import './DockingLabel.css';

/** Folga (em px) entre a base da palavra e o fio de baixo, quando ela está colada. */
const PIN_GAP = 14;
/** Quanto a moldura sobra acima e dos lados da palavra. */
const FRAME = { top: 8, left: 10, right: 40 };
/** Folga lateral do desenho, para as curvas do fio não serem cortadas. */
const SIDE_ROOM = 48;
/** Quanto o fio começa à esquerda da seção (o pé da rampa fica ali). */
const LEFT_BLEED = 40;
/** Até onde, abaixo da janela, o fio ainda é calculado (só para limitar a conta). */
const MAX_BELOW = 2400;
/** Raio dos cantos de cima da aba. */
const RADIUS = 12;
/** Altura máxima da curva que abre as laterais da aba (a "saia"). */
const MAX_FLARE = 130;

/**
 * Uma palavra que vem de baixo da janela até a palavra igual de um título e se
 * "encaixa" nela: "Cupons" + "de desconto" = "Cupons de desconto".
 *
 * Tudo é um fio só, o do topo da seção (a seção não tem borda própria: é este
 * desenho que a faz, sempre inteiro — começa no mesmo ponto e vai até o mesmo
 * ponto, e o que muda com a rolagem é só o formato —, com um vão embaixo da dobra). Enquanto a seção não chegou, o fio fica
 * colado à borda de baixo da janela e, em volta da palavra, ele "dobra" para
 * cima, formando a aba (o notch) — com a seta que avisa que há mais abaixo. À
 * medida que a rolagem leva o fio verdadeiro da seção para cima, a aba vai
 * ficando mais baixa, até o fio passar pela altura da palavra: aí a dobra
 * desaparece, o fio fica reto e a palavra está embaixo dele, no título.
 *
 * A palavra tem sempre o tamanho e a posição horizontal da palavra do título;
 * só a altura muda. O título guarda o lugar com a mesma palavra em tinta
 * transparente (o texto continua sendo lido por leitor de tela e o espaço é o
 * certo). Tudo é calculado a cada rolagem e escrito direto nos elementos, sem
 * passar pelo React.
 */
export function DockingLabel({ slotId, sectionId, label, onActivate }: {
  /** `id` do elemento do título que guarda o lugar da palavra. */
  slotId: string;
  /** `id` da seção: o fio no topo dela é o fio que dobra. */
  sectionId: string;
  label: string;
  onActivate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const gradientRef = useRef<SVGLinearGradientElement>(null);
  const gradientId = `docking-fade-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const button = buttonRef.current;
    const svg = svgRef.current;
    const fill = fillRef.current;
    const line = lineRef.current;
    const gradient = gradientRef.current;
    if (!button || !svg || !fill || !line || !gradient) return;
    let frame = 0;

    const place = () => {
      frame = 0;
      const slot = document.getElementById(slotId);
      const section = document.getElementById(sectionId);
      if (!slot || !section) return;

      const rect = slot.getBoundingClientRect();
      const sec = section.getBoundingClientRect();
      const slotFont = parseFloat(getComputedStyle(slot).fontSize);
      const viewport = window.innerHeight;

      // A palavra: colada embaixo até o título chegar à altura dela; depois, acompanha-o.
      const pinTop = viewport - rect.height - PIN_GAP;
      const wordTop = Math.min(pinTop, rect.top);

      // O fio verdadeiro da seção, onde quer que esteja — inclusive abaixo da
      // janela, onde não se vê. A dobra continua se esticando em direção a ele,
      // como se o fio estivesse lá embaixo; só o limite evita números absurdos.
      const baseline = Math.min(viewport + MAX_BELOW, sec.top + 0.5);
      const notchTop = wordTop - FRAME.top;
      const bump = Math.max(0, baseline - notchTop);
      const fullBump = pinTop + rect.height + PIN_GAP - 1 - (pinTop - FRAME.top);

      // O desenho, em coordenadas da janela deslocadas para a coluna da seção.
      // O traço ganha uma folga de cada lado para as curvas respirarem, mas a
      // linha reta vai só de ponta a ponta da seção.
      const sx = SIDE_ROOM;
      const width = sec.width + SIDE_ROOM * 2;
      const lineEnd = sx + sec.width;
      // O fio começa sempre no mesmo ponto, um pouco à esquerda da seção: é o pé
      // da rampa quando há dobra e o começo da linha reta quando não há.
      const x0 = sx - LEFT_BLEED;
      const x1 = sx + rect.left - sec.left - FRAME.left;
      const x2 = sx + rect.right - sec.left + FRAME.right;
      svg.style.left = `${sec.left - SIDE_ROOM}px`;
      svg.style.width = `${width}px`;
      svg.style.height = `${viewport}px`;

      if (bump < 0.5) {
        line.setAttribute('d', `M${x0} ${baseline} H${lineEnd}`);
        fill.setAttribute('d', '');
      } else {
        // A aba tem cantos de cima arredondados e a metade de cima das laterais
        // reta. Da metade para baixo, cada lateral abre em uma curva longa e
        // macia para fora — uma "saia", não um pilar —, que desce até o fio. Se o
        // fio ainda está longe (abaixo da janela), a curva termina num ponto
        // virtual, também fora da janela, e o fio de verdade só a encontra
        // depois; assim a forma vai se transformando sem saltos.
        const top = notchTop;
        const rTop = Math.min(RADIUS, bump / 2);
        const flareStart = top + Math.max(rTop, Math.min(bump, fullBump) * 0.45);
        const flare = Math.min(MAX_FLARE, Math.max(0, baseline - flareStart));
        const yEnd = flareStart + flare;
        const footR = flare * 2.4;
        const footL = Math.min(flare * 1.5, x1 - x0);
        const xl = x1 - footL;
        const xr = x2 + footR;
        const k = 0.55;

        const leftFoot = `C${xl + footL * k} ${yEnd} ${x1} ${flareStart + flare * k} ${x1} ${flareStart}`;
        const rightFoot = `C${x2} ${flareStart + flare * k} ${xr - footR * k} ${yEnd} ${xr} ${yEnd}`;
        const body = `${leftFoot} V${top + rTop} Q${x1} ${top} ${x1 + rTop} ${top} H${x2 - rTop} Q${x2} ${top} ${x2} ${top + rTop} V${flareStart} ${rightFoot}`;

        // O fio é um só e nunca perde um pedaço: começa em x0, faz a aba e segue
        // até o fim da seção. Embaixo da aba não passa fio.
        line.setAttribute('d', `M${x0} ${baseline} L${xl} ${yEnd} ${body} L${lineEnd} ${baseline}`);
        fill.setAttribute('d', `M${xl} ${yEnd} ${body} Z`);
        // O fundo da aba esmaece para baixo: sem fio embaixo, uma borda seca de
        // cor seria uma mudança brusca em cima da palavra.
        gradient.setAttribute('y1', String(top));
        gradient.setAttribute('y2', String(yEnd));
      }

      // A seta some à medida que a aba baixa.
      button.style.setProperty('--t', String(Math.max(0, 1 - Math.min(1, bump / fullBump))));
      button.style.width = `${rect.width}px`;
      button.style.height = `${rect.height}px`;
      button.style.fontSize = `${slotFont}px`;
      button.style.transform = `translate(${rect.left}px, ${wordTop}px)`;
      // Sem a aba, a palavra é só o título: o clique passa para o que está embaixo.
      button.style.pointerEvents = bump > 12 ? 'auto' : 'none';
    };

    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [slotId, sectionId]);

  return (
    <>
      <svg ref={svgRef} className="docking-label-frame" aria-hidden="true">
        <defs>
          <linearGradient ref={gradientRef} id={gradientId} gradientUnits="userSpaceOnUse" x1="0" x2="0">
            <stop offset="0" className="docking-stop-solid" />
            <stop offset="0.55" className="docking-stop-solid" />
            <stop offset="1" className="docking-stop-clear" />
          </linearGradient>
        </defs>
        <path ref={fillRef} className="docking-label-fill" style={{ fill: `url(#${gradientId})` }} />
        <path ref={lineRef} className="docking-label-line" />
      </svg>
      <button ref={buttonRef} type="button" className="docking-label" onClick={onActivate} aria-label={`Ir para ${label}`}>
        <span className="docking-label-text">{label}</span>
        <svg className="docking-label-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </>
  );
}
