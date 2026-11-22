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

/** Campos da constraint única violada (P2002), como o Prisma os informa em `meta.target`. */
export function duplicatedFieldsOf(error: unknown): string[] {
  const target = (error as { meta?: { target?: unknown } })?.meta?.target;
  return Array.isArray(target) ? target.map(String) : [];
}
