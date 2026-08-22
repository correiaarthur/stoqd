export const formatCurrency = (value: number | string) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

export const parseCurrencyInput = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers === '') return '';
  return (Number(numbers) / 100).toFixed(2);
};

// Porcentagem é digitada direto: "10" são 10%, e não 10 centavos.
export const parsePercentInput = (value: string) => {
  const cleaned = value.replace(',', '.').replace(/[^\d.]/g, '');
  if (cleaned === '') return '';

  const [whole, ...rest] = cleaned.split('.');
  const normalized = rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;

  return Number(normalized) > 100 ? '100' : normalized;
};