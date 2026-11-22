type LogoProps = {
  /** Altura do raminho em px; o nome acompanha a escala. */
  size?: number;
  /** Sobre fundo escuro o raminho troca para os tons claros. */
  onDark?: boolean;
  className?: string;
};

/**
 * A marca: dois brotos — um coroa-de-frade, um mandacaru — e o nome em
 * Fraunces. Desenhada em SVG para não depender de imagem.
 */
export function Logo({ size = 30, onDark = false, className }: LogoProps) {
  const left = onDark ? 'var(--rosa)' : 'var(--coroa)';
  const right = onDark ? 'var(--mandacaru-claro)' : 'var(--mandacaru)';

  return (
    <span className={`logo ${className ?? ''}`} style={{ ['--logo-size' as string]: `${size}px` }}>
      <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <path d="M17 31C17 31 17 21 17 14C17 7.5 22 3 29 3C29 10.5 25.5 17 17 19" stroke={left} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 31C17 24 13.5 19 6 17.5C6 11 10.5 8 16 10" stroke={right} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo-name">stoqd</span>
    </span>
  );
}
