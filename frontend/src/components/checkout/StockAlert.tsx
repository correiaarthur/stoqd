type Props = {
  /** Quantos itens da sacola não cabem mais no estoque. */
  count: number;
  /** A reserva do visitante venceu — muda a frase, não a ação. */
  reservationExpired: boolean;
  onFixAll: () => void;
};

export function StockAlert({ count, reservationExpired, onFixAll }: Props) {
  return (
    <aside className="stock-alert" role="alert">
      <p className="stock-alert-text">
        <strong>
          {reservationExpired ? 'Sua reserva venceu e o estoque ' : 'O estoque '}
          {count === 1 ? 'de um item mudou.' : `de ${count} itens mudou.`}
        </strong>{' '}
        Os itens continuam na sacola. Ajuste ou remova os marcados para continuar.
      </p>
      <button type="button" className="stock-alert-fix" onClick={onFixAll}>
        Ajustar tudo
      </button>
    </aside>
  );
}
