import { formatCountdown } from '../../hooks/useCountdown';

/**
 * O relógio da reserva, com a barra esvaziando.
 *
 * Um número contando para trás é uma informação que se lê; a barra encolhendo é
 * uma que se vê de canto de olho — e é esse o ponto, já que a pessoa está
 * olhando para os produtos, não para o relógio.
 */
export function ReservationTimer({ secondsLeft, totalMinutes }: { secondsLeft: number; totalMinutes: number | null }) {
  const expired = secondsLeft === 0;

  // Sem saber a duração total não dá para desenhar proporção: a barra some e
  // fica só o número, em vez de mostrar uma fração inventada.
  const percent = totalMinutes
    ? Math.min(100, Math.max(0, (secondsLeft / (totalMinutes * 60)) * 100))
    : null;

  return (
    <div className={`reservation-timer ${expired ? 'expired' : ''}`} role="timer">
      <span className="reservation-timer-text">
        {expired ? 'Reserva vencida' : 'Reservado por mais'}
      </span>
      <span className="reservation-timer-clock">{expired ? '00:00' : formatCountdown(secondsLeft)}</span>

      {percent !== null && !expired && (
        <div className="reservation-timer-track" aria-hidden="true">
          <div className="reservation-timer-fill" style={{ width: `${percent}%` }}></div>
        </div>
      )}
    </div>
  );
}
