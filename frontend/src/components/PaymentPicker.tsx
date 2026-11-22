import { useEffect, useRef, useState } from 'react';
import type { InstallmentOption } from '../hooks/usePaymentOptions';
import { formatCurrency } from '../utils/formatters';
import './PaymentPicker.css';

export type PaymentChoice = {
  paymentType: 'VISTA' | 'PRAZO';
  installmentsCount: number;
};

type Props = {
  /** Já com o desconto abatido: os juros incidem sobre o líquido. */
  netTotal: number;
  /** Vem do pai, que usa as mesmas opções para calcular o total a cobrar. */
  installmentOptions: InstallmentOption[];
  loading: boolean;
  value: PaymentChoice;
  onChange: (choice: PaymentChoice) => void;
  /** Vender a prazo exige um cliente vinculado — o balcão trava sem ele. */
  installmentsDisabledReason?: string;
  /** Muda só o texto: para o cliente é um pedido, para o balcão é a venda. */
  variant?: 'customer' | 'admin';
};

/**
 * Duas escolhas, não onze.
 *
 * Listar cada parcelamento como uma opção de primeiro nível transformava a
 * decisão simples — "à vista ou parcelado?" — numa lista longa em que as duas
 * coisas de peso diferente competiam. Agora a forma de pagamento é uma escolha
 * de dois, e o número de parcelas é um detalhe que só aparece depois de a
 * pessoa dizer que quer parcelar.
 *
 * Quando "Parcelado" é escolhido, ele vira o cabeçalho de uma lista aberta
 * logo abaixo — sem segundo clique para abrir e sem popup cobrindo a página.
 * Seis linhas cabem de uma vez; da sétima em diante, a lista rola.
 */
export function PaymentPicker({
  netTotal, installmentOptions, loading, value, onChange, installmentsDisabledReason, variant = 'customer',
}: Props) {
  const locked = Boolean(installmentsDisabledReason);
  const isInstallments = value.paymentType === 'PRAZO';

  const selected = installmentOptions.find(option => option.installments === value.installmentsCount);
  const hasOptions = installmentOptions.length > 0;

  // A lista de parcelas é um dropdown preso ao "Parcelado": abre ao escolher,
  // fecha ao escolher uma parcela, com Esc ou clicando fora.
  const [open, setOpen] = useState(isInstallments);
  const groupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listOpen = open && isInstallments && hasOptions;

  useEffect(() => {
    if (!listOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [listOpen]);

  const pickUpfront = () => {
    setOpen(false);
    onChange({ paymentType: 'VISTA', installmentsCount: 1 });
  };

  const pickInstallments = () => {
    if (locked || !hasOptions) return;

    // Já em parcelado: o clique só abre ou fecha a lista.
    if (isInstallments) {
      setOpen(value => !value);
      return;
    }
    setOpen(true);

    // Ao trocar para parcelado, cai na primeira opção disponível em vez de
    // ficar num "1x" que não existe na lista.
    const fallback = installmentOptions[0]!.installments;
    const keep = selected ? value.installmentsCount : fallback;

    onChange({ paymentType: 'PRAZO', installmentsCount: keep });
  };

  return (
    <div className={`payment-picker payment-picker-${variant}`}>
      <span className="payment-label">
        {variant === 'admin' ? 'Forma de pagamento' : 'Como você quer pagar?'}
      </span>

      <div className="payment-modes">
        <button
          type="button"
          className={`payment-mode ${!isInstallments ? 'selected' : ''}`}
          onClick={pickUpfront}
        >
          <span className="payment-radio" aria-hidden="true"></span>
          <span className="payment-mode-text">
            <strong>À vista</strong>
            <span className="payment-mode-note">Dinheiro, pix ou cartão</span>
          </span>
          <span className="payment-mode-value">{formatCurrency(netTotal)}</span>
        </button>

        <div className={`payment-group ${listOpen ? 'open' : ''}`} ref={groupRef}>
          <button
            type="button"
            className={`payment-mode payment-mode-header ${isInstallments ? 'selected' : ''}`}
            onClick={pickInstallments}
            ref={triggerRef}
            disabled={locked || !hasOptions}
            aria-haspopup="listbox"
            aria-expanded={listOpen}
          >
            <span className="payment-radio" aria-hidden="true"></span>
            <span className="payment-mode-text">
              <strong>Parcelado</strong>
              <span className="payment-mode-note">
                {loading && !hasOptions
                  ? 'carregando...'
                  : isInstallments && selected
                    ? `${selected.installments}x de ${formatCurrency(selected.installmentValue)}`
                    : hasOptions
                      ? `de ${installmentOptions[0]!.installments}x a ${installmentOptions[installmentOptions.length - 1]!.installments}x`
                      : 'indisponível'}
              </span>
            </span>
            {isInstallments && selected && (
              <span className="payment-mode-value">{formatCurrency(selected.total)}</span>
            )}
          </button>

          {listOpen && (
            <div className="payment-plans" role="listbox" aria-label="Número de parcelas">
              {installmentOptions.map(option => {
                const isCurrent = option.installments === value.installmentsCount;

                return (
                  <button
                    key={option.installments}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className={`payment-plan ${isCurrent ? 'current' : ''}`}
                    onClick={() => { setOpen(false); onChange({ paymentType: 'PRAZO', installmentsCount: option.installments }); }}
                  >
                    <span className="payment-plan-count">{option.installments}x</span>
                    <span className="payment-plan-value">{formatCurrency(option.installmentValue)}</span>
                    <span className="payment-plan-interest">
                      {option.interestPercent > 0 ? `juros de ${option.interestPercent}%` : 'sem juros'}
                    </span>
                    <span className="payment-plan-total">{formatCurrency(option.total)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {installmentsDisabledReason && (
        <span className="payment-hint">{installmentsDisabledReason}</span>
      )}

      {!loading && !hasOptions && (
        <span className="payment-hint">Por enquanto só à vista.</span>
      )}
    </div>
  );
}
