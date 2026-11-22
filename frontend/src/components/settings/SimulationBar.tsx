import { formatCurrency, parseCurrencyInput } from '../../utils/formatters';

/**
 * Simulação: a loja escolhe o valor do pedido e vê o que cada taxa faz com ele
 * — antes de salvar. O valor fica no formato dos outros campos de dinheiro
 * ("300.00").
 */
export function SimulationBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="sim-bar">
      <div className="sim-field">
        <label htmlFor="sim-valor">Simular com um pedido de</label>
        <input
          id="sim-valor"
          type="text"
          inputMode="numeric"
          placeholder="R$ 0,00"
          value={value ? formatCurrency(value) : ''}
          onChange={e => onChange(parseCurrencyInput(e.target.value))}
        />
      </div>
      <div className="sim-presets" role="group" aria-label="Valores de exemplo">
        {[100, 300, 500, 1000].map(preset => (
          <button
            key={preset}
            type="button"
            className="sim-preset"
            aria-pressed={Number(value) === preset}
            onClick={() => onChange(preset.toFixed(2))}
          >
            {formatCurrency(preset).replace(',00', '')}
          </button>
        ))}
      </div>
    </div>
  );
}
