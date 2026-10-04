import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { getApiErrorMessage } from '../errors';

/**
 * Sem isto o operador só vê o texto genérico e nunca descobre que faltou
 * estoque, que o desconto era inválido, que o cupom venceu.
 *
 * O caso que mais importa é o erro de rede: ali não existe `response`, e a
 * função precisa cair no texto padrão em vez de estourar.
 */
describe('getApiErrorMessage', () => {
  function erroDaApi(error: string) {
    const e = new AxiosError('request failed');
    e.response = { data: { error }, status: 400, statusText: '', headers: {}, config: {} as never };
    return e;
  }

  it('usa a mensagem que a API mandou', () => {
    expect(getApiErrorMessage(erroDaApi('Estoque insuficiente para Café.'), 'padrão'))
      .toBe('Estoque insuficiente para Café.');
  });

  it('erro de rede, sem response, cai no padrão', () => {
    expect(getApiErrorMessage(new AxiosError('Network Error'), 'padrão')).toBe('padrão');
  });

  it('o que não é erro do axios cai no padrão', () => {
    for (const e of [new Error('qualquer'), 'string solta', null, undefined, { error: 'ignorado' }]) {
      expect(getApiErrorMessage(e, 'padrão')).toBe('padrão');
    }
  });

  it('resposta sem campo error cai no padrão', () => {
    const e = new AxiosError('x');
    e.response = { data: { outro: 'campo' }, status: 500, statusText: '', headers: {}, config: {} as never };
    expect(getApiErrorMessage(e, 'padrão')).toBe('padrão');
  });

  it('mensagem vazia cai no padrão', () => {
    expect(getApiErrorMessage(erroDaApi(''), 'padrão')).toBe('padrão');
  });
});
