import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors.js';
import { duplicatedFieldsOf, rethrowTranslated, translatePrismaError } from '../prismaErrors.js';

describe('duplicatedFieldsOf', () => {
  it('lê meta.target, como o Prisma informa sem adapter', () => {
    expect(duplicatedFieldsOf({ code: 'P2002', meta: { target: ['email'] } })).toEqual(['email']);
  });

  it('lê o campo do adapter pg, onde meta.target não existe', () => {
    // O formato real que o Prisma 7 com o adapter `pg` devolve.
    const erro = {
      code: 'P2002',
      meta: {
        modelName: 'User',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { fields: ['phone'] } },
        },
      },
    };

    expect(duplicatedFieldsOf(erro)).toEqual(['phone']);
  });

  it('constraint com mais de um campo', () => {
    expect(duplicatedFieldsOf({ meta: { driverAdapterError: { cause: { constraint: { fields: ['a', 'b'] } } } } })).toEqual(['a', 'b']);
  });

  it.each([undefined, null, {}, { meta: {} }, { meta: { target: 'email' } }, { meta: { driverAdapterError: {} } }, 'texto', 42])(
    '%j não tem campo: lista vazia, sem lançar',
    (erro) => {
      expect(duplicatedFieldsOf(erro)).toEqual([]);
    }
  );
});

describe('rethrowTranslated', () => {
  it('um erro conhecido vira DomainError com o status e a mensagem', () => {
    try {
      rethrowTranslated({ code: 'P2002' }, { duplicate: 'Já existe.' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e).toMatchObject({ message: 'Já existe.', status: 409 });
    }
  });

  it('P2025 é 404 e P2003 é 409', () => {
    expect(() => rethrowTranslated({ code: 'P2025' }, { notFound: 'Não achei.' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => rethrowTranslated({ code: 'P2003' }, { inUse: 'Em uso.' })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('um erro que não é conhecido sai como está, para o controller logar e dar 500', () => {
    const inesperado = new Error('conexão caiu');

    expect(() => rethrowTranslated(inesperado, { duplicate: 'x' })).toThrow(inesperado);
  });

  it('um código conhecido sem mensagem para ele também sai como está', () => {
    const erro = { code: 'P2002' };
    expect(() => rethrowTranslated(erro, { notFound: 'x' })).toThrow();
    expect(translatePrismaError(erro, { notFound: 'x' })).toBeNull();
  });
});
