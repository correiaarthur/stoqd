// A API responde { error: "mensagem" }. Sem isto o operador só vê o texto
// genérico e nunca descobre que faltou estoque, que o desconto era inválido, etc.
export const getApiErrorMessage = (err: any, fallback: string) => {
  return err?.response?.data?.error || fallback;
};
