import { AxiosError } from 'axios';

// A API responde { error: "mensagem" }. Sem isto o operador só vê o texto
// genérico e nunca descobre que faltou estoque, que o desconto era inválido, etc.
export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  // `unknown` e não `any` porque o que chega no catch pode ser qualquer coisa:
  // erro do axios, erro de rede sem `response`, ou um throw de outro lugar.
  const apiMessage = err instanceof AxiosError
    ? (err.response?.data as { error?: string } | undefined)?.error
    : undefined;

  return apiMessage || fallback;
};
