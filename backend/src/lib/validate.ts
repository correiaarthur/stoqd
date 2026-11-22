import { z } from 'zod';

/**
 * Validação de entrada com schemas (Zod).
 *
 * Antes, cada controller lia o corpo à mão — `Number(x) || 1`, `String(x).trim()`,
 * `if (!x)` — e cada um decidia sozinho o que era válido. Foi daí que vieram
 * estoque negativo aceito com 201, parcelamento de 0,5x que gerava venda sem
 * parcelas e `NaN` chegando ao Prisma. Um schema declara a forma uma vez, devolve
 * o dado já convertido e tipado, e o que não está no schema nem passa adiante
 * (campo extra no corpo não vira coluna).
 *
 * Todo schema define a mensagem de cada regra, em português: é o texto que o
 * operador lê na tela. A mensagem padrão do Zod, em inglês, nunca deve sair daqui.
 */

// Mensagem que um schema esqueceu de definir sai em português, nunca no inglês do Zod.
z.config(z.locales.ptBR());

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Valida e devolve o dado convertido, ou a **primeira** mensagem de erro — a que
 * a tela mostra. A ordem é a das chaves do schema, então "o que falta primeiro"
 * é decidido onde o schema é escrito.
 */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);

  if (result.success) return { ok: true, data: result.data };

  return { ok: false, error: result.error.issues[0]?.message ?? 'Dados inválidos.' };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Corpo de requisição. O que não for um objeto (sem corpo, texto, lista) vale como
 * objeto vazio: o schema então responde "falta tal campo" em vez de um erro
 * genérico sobre o tipo. Chaves que não estão no schema são descartadas.
 */
export const bodyOf = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess(value => (isRecord(value) ? value : {}), z.object(shape));

/** Ausente, `null` ou texto vazio: o campo não foi informado. */
export const isBlank = (value: unknown) => value === undefined || value === null || value === '';

/** Campo opcional: ausente, `null` ou vazio viram `null`; o resto passa pelo schema. */
export const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess(value => (isBlank(value) ? null : value), schema.nullable());

/** Inteiro maior que zero, lido como `Number()` lê: `"3"` vale 3, `""` e `null` valem 0 e falham. */
export const positiveInt = (message: string) =>
  z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

/** Valor em reais: de zero até o teto, finito. */
export const money = (message: string, max: number) =>
  z.coerce.number({ error: message }).min(0, { error: message }).max(max, { error: message });

/** Texto aparado. Ausente vale vazio, para as regras de tamanho responderem. */
export const trimmed = z.preprocess(value => String(value ?? '').trim(), z.string());
