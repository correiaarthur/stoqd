import { useState } from 'react';

type LazyImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** Imagem acima da dobra (o destaque da vitrine): baixa já, com prioridade. */
  eager?: boolean;
};

/**
 * Foto de produto que só baixa quando chega perto da tela e aparece com um
 * esmaecer curto. Até lá, quem está por trás é o esqueleto do contêiner — a
 * foto nunca "pula" para dentro da página, porque o espaço dela já é reservado
 * pela proporção do pai.
 */
export function LazyImage({ src, alt, className, eager = false }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      className={`lazy-img ${loaded ? 'is-loaded' : ''} ${className ?? ''}`}
      onLoad={() => setLoaded(true)}
      // Foto quebrada não pode deixar o esqueleto piscando para sempre.
      onError={() => setLoaded(true)}
    />
  );
}
