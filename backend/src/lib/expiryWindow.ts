/**
 * Validade: a comparação por **dia de calendário**.
 *
 * `Product.expiryDate` é `DateTime` e guarda a meia-noite UTC do dia impresso na
 * embalagem — validade não tem hora. Comparar isso com `new Date()` depois de um
 * `setHours(0,0,0,0)` compara meia-noite **local** com meia-noite **UTC**: em
 * qualquer fuso a oeste de Greenwich, o Brasil inteiro, sobra uma diferença de
 * horas e o produto que vence hoje cai do lado errado.
 *
 * Foi o bug: o Dashboard contava como vencido o que vence hoje, nos 52 produtos
 * com data. O mesmo erro existia no frontend (`utils/expiry.ts`) e foi corrigido
 * lá primeiro — a regra estava escrita duas vezes e consertar uma não consertou
 * a outra. Daí este módulo: no backend ela passa a ter um lugar só.
 */

/** Janela de "vencendo em breve". O mesmo número que a tela de estoque usa. */
export const EXPIRY_WARNING_DAYS = 90;

/**
 * Meia-noite UTC do dia de hoje — comparável direto com `expiryDate`.
 *
 * Usa o dia do calendário **local** (é o dia em que a loja está) e o ancora em
 * UTC (é como a data está guardada).
 */
export function startOfTodayUTC(agora: Date = new Date()): Date {
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

/** O fim da janela de aviso, nos mesmos termos. */
export function expiryWarningLimitUTC(agora: Date = new Date()): Date {
  const limite = startOfTodayUTC(agora);
  limite.setUTCDate(limite.getUTCDate() + EXPIRY_WARNING_DAYS);
  return limite;
}

export type ExpiryStatus = 'none' | 'expired' | 'soon' | 'ok';

/**
 * Em que situação está a validade de um produto.
 *
 * Quem vence hoje é `soon`, não `expired`: ainda pode ser vendido hoje.
 */
export function expiryStatusOf(expiryDate: Date | null, agora: Date = new Date()): ExpiryStatus {
  if (!expiryDate) return 'none';

  const hoje = startOfTodayUTC(agora);
  if (expiryDate < hoje) return 'expired';

  return expiryDate <= expiryWarningLimitUTC(agora) ? 'soon' : 'ok';
}
