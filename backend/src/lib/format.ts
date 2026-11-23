/** Formatação de valores para texto que uma pessoa lê. */

/**
 * Reais como o Brasil escreve: R$ 1.234,56.
 *
 * Existe aqui e não em cada módulo porque o mesmo valor aparece no aviso de
 * pedido novo e na mensagem do cupom — e as duas cópias eram idênticas, o que
 * só garante que a próxima diferença vai passar despercebida.
 */
export function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
