import { useEffect, useState } from 'react';

/**
 * Segundos que faltam até `expiresAt`, atualizados de segundo em segundo.
 *
 * Devolve `null` quando não há prazo, e 0 quando venceu — a tela decide o que
 * dizer em cada caso. Quem manda no vencimento é o servidor: isto aqui é só o
 * relógio que a pessoa vê, por isso o valor é calculado na renderização e o
 * efeito só faz o relógio andar.
 */
export function useCountdown(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return null;

  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
