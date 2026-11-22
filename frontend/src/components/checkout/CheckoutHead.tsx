import { ReservationTimer } from './ReservationTimer';

type Props = {
  admin: boolean;
  productCount: number;
  unitCount: number;
  /** `null` sem reserva ativa. */
  secondsLeft: number | null;
  reservationMinutes: number | null;
};

export function CheckoutHead({ admin, productCount, unitCount, secondsLeft, reservationMinutes }: Props) {
  const place = admin ? 'Balcão' : 'Sacola';

  return (
    <div className="checkout-head">
      <div className="checkout-head-text">
        <span className="checkout-kicker">
          {productCount === 0
            ? place
            : `${place} · ${productCount} ${productCount === 1 ? 'produto' : 'produtos'}, ${unitCount} ${unitCount === 1 ? 'unidade' : 'unidades'}`}
        </span>
        <h1 className="checkout-title">
          {admin ? <>Fechar <em>venda.</em></> : <>Seu pedido, <em>reservado.</em></>}
        </h1>
      </div>
      {productCount > 0 && secondsLeft !== null && !admin && (
        <ReservationTimer secondsLeft={secondsLeft} totalMinutes={reservationMinutes} />
      )}
    </div>
  );
}
