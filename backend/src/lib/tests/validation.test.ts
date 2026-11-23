import { describe, expect, it } from 'vitest';

import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  optionalEmail,
  accountSchema,
  changePasswordSchema,
  labelBody,
  parseCustomerBody,
  parseId,
  registerSchema,
  validatePassword,
} from '../validation.js';
import { parseWith } from '../validate.js';

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

describe('accountSchema (perfil)', () => {
  const ok = { name: 'Maria', phone: '12934567890', email: 'maria@loja.com' };
  const mensagem = (body: unknown) => { const r = parseWith(accountSchema, body); return r.ok ? null : r.error; };

  it('aceita um conjunto válido e devolve os campos já normalizados', () => {
    expect(parseWith(accountSchema, { name: '  Maria   Lima ', phone: '(12) 93456-7890', email: ' MARIA@LOJA.COM ' }))
      .toEqual({ ok: true, data: { name: 'Maria Lima', phone: '12934567890', email: 'maria@loja.com' } });
  });

  it('e-mail ausente, nulo ou vazio é válido — é opcional — e vira null', () => {
    for (const email of [undefined, null, '', '   ']) {
      expect(parseWith(accountSchema, { ...ok, email })).toMatchObject({ ok: true, data: { email: null } });
    }
  });

  it('diz o que está errado em cada campo', () => {
    expect(mensagem({ ...ok, name: 'M' })).toBe('Informe seu nome.');
    expect(mensagem({ ...ok, phone: '123' })).toBe('Informe um telefone válido com DDD.');
    expect(mensagem({ ...ok, email: 'nao-e-email' })).toMatch(/e-mail informado não parece válido/);
  });

  it('com dois campos errados, reporta o primeiro: nome antes de telefone', () => {
    expect(mensagem({ name: '', phone: '1', email: null })).toBe('Informe seu nome.');
  });

  it('corpo ausente ou que não é objeto diz o que falta, não um erro de tipo', () => {
    expect(mensagem(undefined)).toBe('Informe seu nome.');
    expect(mensagem('texto')).toBe('Informe seu nome.');
    expect(mensagem([1, 2])).toBe('Informe seu nome.');
  });

  it('campo que não está no schema não passa adiante', () => {
    const r = parseWith(accountSchema, { ...ok, role: 'admin', customerId: 99, passwordHash: 'x' });
    expect(r.ok && Object.keys(r.data).sort()).toEqual(['email', 'name', 'phone']);
  });
});

describe('registerSchema', () => {
  const ok = { name: 'Maria', phone: '12934567890', password: 'senha-forte-123' };

  it('aceita o cadastro completo', () => {
    expect(parseWith(registerSchema, ok)).toMatchObject({ ok: true, data: { password: 'senha-forte-123', email: null } });
  });

  it('valida o perfil antes da senha', () => {
    const r = parseWith(registerSchema, { name: '', phone: '1', password: '1' });
    expect(r.ok ? null : r.error).toBe('Informe seu nome.');
  });

  it('senha curta, ausente ou que não é texto é recusada', () => {
    for (const password of ['1234567', undefined, null, 12345678]) {
      const r = parseWith(registerSchema, { ...ok, password });
      expect(r.ok ? null : r.error).toMatch(/pelo menos 8/);
    }
  });

  it('o bcrypt só lê 72 bytes: senha acima disso é recusada, em vez de truncada em silêncio', () => {
    expect(parseWith(registerSchema, { ...ok, password: 'a'.repeat(72) }).ok).toBe(true);

    const r = parseWith(registerSchema, { ...ok, password: 'a'.repeat(73) });
    expect(r.ok ? null : r.error).toMatch(/no máximo 72/);
  });

  it('o teto é em bytes: acento pesa dois', () => {
    expect(parseWith(registerSchema, { ...ok, password: 'é'.repeat(36) }).ok).toBe(true); // 72 bytes
    expect(parseWith(registerSchema, { ...ok, password: 'é'.repeat(37) }).ok).toBe(false); // 74 bytes
  });
});

describe('changePasswordSchema', () => {
  it('lê a senha atual como texto e valida a nova', () => {
    expect(parseWith(changePasswordSchema, { currentPassword: 'velha', newPassword: 'nova-senha-1' }))
      .toEqual({ ok: true, data: { currentPassword: 'velha', newPassword: 'nova-senha-1' } });
  });

  it('senha atual ausente vale texto vazio: quem recusa é a conferência com o banco', () => {
    expect(parseWith(changePasswordSchema, { newPassword: 'nova-senha-1' }))
      .toMatchObject({ ok: true, data: { currentPassword: '' } });
  });

  it('a nova senha fraca é recusada', () => {
    const r = parseWith(changePasswordSchema, { currentPassword: 'x', newPassword: 'curta' });
    expect(r.ok ? null : r.error).toMatch(/pelo menos 8/);
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

describe('labelBody (marca e categoria)', () => {
  const nome = (body: unknown) => parseWith(labelBody('Nome é obrigatório'), body);

  it('apara e colapsa espaços', () => {
    expect(nome({ name: '  Marca   X ' })).toEqual({ ok: true, data: { name: 'Marca X' } });
  });

  it('recusa vazio, ausente e texto longo demais, com a mensagem de quem chamou', () => {
    for (const body of [{ name: '   ' }, {}, undefined, { name: 'a'.repeat(101) }]) {
      expect(nome(body)).toEqual({ ok: false, error: 'Nome é obrigatório' });
    }
  });

  it('cem caracteres ainda passa', () => {
    expect(nome({ name: 'a'.repeat(100) }).ok).toBe(true);
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
