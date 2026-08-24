/** Validações compartilhadas entre cadastro, perfil e pedido. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/** Guarda só os dígitos: o mesmo telefone digitado de três jeitos vira um só. */
export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidPhone(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 13;
}

export function normalizeName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export type FieldError = { field: string; error: string };

/**
 * Valida os campos que cadastro e edição de perfil têm em comum.
 *
 * O telefone é o identificador de acesso, então é ele o obrigatório. O e-mail
 * é opcional — mas quando vem preenchido precisa ser válido, senão a loja
 * guarda um endereço que nunca vai receber nada.
 */
export function validateAccountFields(input: { name: string; phone: string; email: string | null }): FieldError | null {
  if (input.name.length < 2) {
    return { field: 'name', error: "Informe seu nome." };
  }
  if (!isValidPhone(input.phone)) {
    return { field: 'phone', error: "Informe um telefone válido com DDD." };
  }
  if (input.email !== null && !isValidEmail(input.email)) {
    return { field: 'email', error: "O e-mail informado não parece válido. Deixe em branco se preferir." };
  }
  return null;
}

/** Devolve o e-mail normalizado, ou `null` quando o campo veio vazio. */
export function optionalEmail(value: unknown): string | null {
  const email = normalizeEmail(value);
  return email === '' ? null : email;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}
