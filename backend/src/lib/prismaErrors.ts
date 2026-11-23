import { DomainError } from './errors.js';

/**
 * Traduz os erros conhecidos do Prisma em respostas que o operador entende.
 *
 * Sem isso, tentar apagar um produto já vendido devolve 500 "Erro ao eliminar
 * produto" — o operador não descobre que a restrição existe nem o que fazer.
 *
 * Lê `error.code` diretamente em vez de importar a classe de erro do Prisma,
 * que muda de lugar entre versões do client.
 */
type TranslatedError = { status: number; error: string };

type Messages = {
  /** P2003 — outra tabela referencia este registro. */
  inUse?: string;
  /** P2025 — o registro não existe. */
  notFound?: string;
  /** P2002 — violaria uma constraint de unicidade. */
  duplicate?: string;
};

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
}

export function translatePrismaError(error: unknown, messages: Messages): TranslatedError | null {
  const code = getErrorCode(error);

  if (code === 'P2003' && messages.inUse) return { status: 409, error: messages.inUse };
  if (code === 'P2025' && messages.notFound) return { status: 404, error: messages.notFound };
  if (code === 'P2002' && messages.duplicate) return { status: 409, error: messages.duplicate };

  return null;
}

/**
 * Campos da constraint única violada (P2002).
 *
 * O Prisma informa de dois jeitos, conforme o motor. Sem adapter, em
 * `meta.target`. Com o adapter `pg` (o que este projeto usa), `meta.target` **não
 * existe**: o campo vem em `meta.driverAdapterError.cause.constraint.fields`. Ler só
 * o primeiro devolvia sempre lista vazia — e duplicar um e-mail era reportado como
 * telefone duplicado.
 */
export function duplicatedFieldsOf(error: unknown): string[] {
  const meta = (error as {
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
    };
  })?.meta;

  const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;

  return Array.isArray(fields) ? fields.map(String) : [];
}

/**
 * Traduz o erro do Prisma em `DomainError` (com o status certo) quando é um dos
 * conhecidos, e o relança como está quando não é — para o `catch` do controller
 * logar e responder 500.
 */
export function rethrowTranslated(error: unknown, messages: Messages): never {
  const translated = translatePrismaError(error, messages);

  if (translated) throw new DomainError(translated.error, translated.status);

  throw error;
}
