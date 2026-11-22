import { describe, expect, it } from 'vitest';

import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  optionalEmail,
  validateAccountFields,
  parseCustomerBody,
  parseId,
  parseLabel,
  validatePassword,
} from '../validation.js';

/**
 * O telefone é o identificador de acesso, então normalizá-lo é o que impede o
 * mesmo número digitado de três jeitos de virar três contas.
 *
 * `customers.controller` também passa por `parseCustomerBody`, então o telefone
 * de um Customer casa com o de um User e a sugestão de vínculo em `orders.list`
 * acerta.
 */

describe('normalizePhone', () => {
  it('guarda só os dígitos', () => {
    expect(normalizePhone('(12) 3456-7890')).toBe('1234567890');
    expect(normalizePhone('+55 12 93456-7890')).toBe('5512934567890');
  });

  it('o mesmo número em três formatos vira um só', () => {
    const formas = ['(12) 93456-7890', '12934567890', '12 9 3456 7890'];
    expect(new Set(formas.map(normalizePhone)).size).toBe(1);
  });

  it('nulo e indefinido viram string vazia', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('isValidPhone', () => {
  it('aceita de 10 a 13 dígitos', () => {
    expect(isValidPhone('1234567890')).toBe(true);
    expect(isValidPhone('1234567890123')).toBe(true);
  });

  it('recusa fora da faixa', () => {
    expect(isValidPhone('123456789')).toBe(false);
    expect(isValidPhone('12345678901234')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('apara e desce para minúsculas', () => {
    expect(normalizeEmail('  Maria@Loja.COM ')).toBe('maria@loja.com');
  });
});

describe('isValidEmail', () => {
  it('aceita endereço com arroba e ponto no domínio', () => {
    expect(isValidEmail('maria@loja.com')).toBe(true);
    expect(isValidEmail('maria.silva+x@sub.loja.com.br')).toBe(true);
  });

  it('recusa sem arroba, sem domínio, sem ponto e com espaço', () => {
    for (const e of ['maria', 'maria@', '@loja.com', 'maria@loja', 'ma ria@loja.com']) {
      expect(isValidEmail(e)).toBe(false);
    }
  });
});

describe('normalizeName', () => {
  it('apara e colapsa espaços repetidos', () => {
    expect(normalizeName('  Maria   da   Silva ')).toBe('Maria da Silva');
  });
});

describe('optionalEmail', () => {
  it('campo vazio vira null, não string vazia', () => {
    // Importa porque `User.email` é único: várias contas sem e-mail convivem
    // como NULL, mas duas strings vazias colidiriam.
    expect(optionalEmail('')).toBeNull();
    expect(optionalEmail('   ')).toBeNull();
    expect(optionalEmail(null)).toBeNull();
  });

  it('e-mail preenchido volta normalizado', () => {
    expect(optionalEmail(' Maria@Loja.com ')).toBe('maria@loja.com');
  });
});

describe('validatePassword', () => {
  it('exige pelo menos 8 caracteres', () => {
    expect(validatePassword('1234567')).toContain('8');
    expect(validatePassword('12345678')).toBeNull();
  });

  it('recusa o que não é string', () => {
    expect(validatePassword(undefined)).not.toBeNull();
    expect(validatePassword(12345678)).not.toBeNull();
  });
});

describe('validateAccountFields', () => {
  const ok = { name: 'Maria', phone: '12934567890', email: 'maria@loja.com' };

  it('aceita um conjunto válido', () => {
    expect(validateAccountFields(ok)).toBeNull();
  });

  it('e-mail nulo é válido — é opcional', () => {
    expect(validateAccountFields({ ...ok, email: null })).toBeNull();
  });

  it('aponta o campo, não só a mensagem', () => {
    // A tela usa `field` para marcar o input certo.
    expect(validateAccountFields({ ...ok, name: 'M' })?.field).toBe('name');
    expect(validateAccountFields({ ...ok, phone: '123' })?.field).toBe('phone');
    expect(validateAccountFields({ ...ok, email: 'nao-e-email' })?.field).toBe('email');
  });

  it('valida nome antes de telefone', () => {
    // Com dois campos errados, reporta o primeiro — a ordem atual é essa.
    expect(validateAccountFields({ name: '', phone: '1', email: null })?.field).toBe('name');
  });
});

describe('parseId', () => {
  it('aceita inteiro positivo', () => {
    expect(parseId('42')).toBe(42);
  });

  it.each(['abc', '', '0', '-3', '1.5', undefined, null])('recusa %s', (value) => {
    expect(parseId(value)).toBeNull();
  });
});

describe('parseLabel', () => {
  it('apara e colapsa espaços', () => {
    expect(parseLabel('  Marca   X ')).toBe('Marca X');
  });

  it('recusa vazio e texto longo demais', () => {
    expect(parseLabel('   ')).toBeNull();
    expect(parseLabel(undefined)).toBeNull();
    expect(parseLabel('a'.repeat(101))).toBeNull();
  });
});

describe('parseCustomerBody', () => {
  it('normaliza telefone e e-mail', () => {
    expect(parseCustomerBody({ name: ' Ana  Lima ', phone: '(12) 93456-7890', email: ' ANA@X.COM ' })).toEqual({
      ok: true,
      data: { name: 'Ana Lima', phone: '12934567890', email: 'ana@x.com' },
    });
  });

  it('contatos vazios viram null', () => {
    expect(parseCustomerBody({ name: 'Ana', phone: '', email: '' })).toEqual({
      ok: true,
      data: { name: 'Ana', phone: null, email: null },
    });
  });

  it('recusa nome ausente, telefone curto e e-mail inválido', () => {
    expect(parseCustomerBody({ phone: '12934567890' }).ok).toBe(false);
    expect(parseCustomerBody({ name: 'Ana', phone: '123' }).ok).toBe(false);
    expect(parseCustomerBody({ name: 'Ana', email: 'nao-e-email' }).ok).toBe(false);
  });
});
