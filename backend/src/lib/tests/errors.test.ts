import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DomainError, respondWithError } from '../errors.js';

function fakeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as typeof res & Response;
}

afterEach(() => vi.restoreAllMocks());

describe('respondWithError', () => {
  it('erro de domínio vira a própria mensagem, com o status dele', () => {
    const res = fakeResponse();
    respondWithError(res, new DomainError('Estoque insuficiente.', 409), 'fallback');

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Estoque insuficiente.' });
  });

  it('o status padrão de um erro de domínio é 400', () => {
    const res = fakeResponse();
    respondWithError(res, new DomainError('Inválido.'), 'fallback');

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('erro desconhecido vira 500 genérico, sem vazar a mensagem interna', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeResponse();
    respondWithError(res, new Error('connection refused at 10.0.0.5'), 'Não foi possível salvar.');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não foi possível salvar.' });
  });
});
