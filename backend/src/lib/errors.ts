import type { Response } from 'express';

/**
 * Regra de negócio que o operador precisa ler na tela — e não um erro interno.
 *
 * Carrega o status HTTP junto da mensagem, para o controller não precisar de um
 * `if` por tipo de erro: quem lança decide se é 400, 404, 409 ou 429.
 */
export class DomainError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Resposta padrão do `catch` de um controller: erro de domínio vira a própria
 * mensagem com o status dele; qualquer outra coisa é logada e vira 500 com um
 * texto genérico, sem vazar detalhe interno.
 */
export function respondWithError(res: Response, error: unknown, fallback: string) {
  if (error instanceof DomainError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}
