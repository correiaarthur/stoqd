import { z } from 'zod';

import { bodyOf, parseWith, type ParseResult } from './validate.js';

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

/** Devolve o e-mail normalizado, ou `null` quando o campo veio vazio. */
export function optionalEmail(value: unknown): string | null {
  const email = normalizeEmail(value);
  return email === '' ? null : email;
}

/**
 * Teto da senha, em bytes. O bcrypt só lê os 72 primeiros: acima disso duas
 * senhas diferentes com o mesmo começo gerariam o mesmo hash, e a pessoa que
 * digitou uma frase longa estaria protegida só pelo começo dela, sem saber.
 */
export const MAX_PASSWORD_BYTES = 72;

const MSG_SENHA = `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;

export const passwordSchema = z.string({ error: MSG_SENHA })
  .min(MIN_PASSWORD_LENGTH, { error: MSG_SENHA })
  .refine(password => Buffer.byteLength(password) <= MAX_PASSWORD_BYTES, {
    error: `A senha pode ter no máximo ${MAX_PASSWORD_BYTES} caracteres.`,
  });

/** `null` quando a senha serve; senão, a mensagem. */
export function validatePassword(password: unknown): string | null {
  const parsed = parseWith(passwordSchema, password);
  return parsed.ok ? null : parsed.error;
}

const MSG_EMAIL_CONTA = "O e-mail informado não parece válido. Deixe em branco se preferir.";

/**
 * Os campos que cadastro e edição de perfil têm em comum.
 *
 * O telefone é o identificador de acesso, então é ele o obrigatório. O e-mail
 * é opcional — mas quando vem preenchido precisa ser válido, senão a loja
 * guarda um endereço que nunca vai receber nada. Já normalizados: nome sem
 * espaço sobrando, só os dígitos do telefone, e-mail em minúscula ou `null`.
 */
const accountFields = {
  name: z.preprocess(normalizeName, z.string().min(2, { error: "Informe seu nome." })),
  phone: z.preprocess(normalizePhone, z.string().refine(isValidPhone, { error: "Informe um telefone válido com DDD." })),
  email: z.preprocess(optionalEmail, z.string().refine(isValidEmail, { error: MSG_EMAIL_CONTA }).nullable()),
};

/** Editar o próprio perfil. */
export const accountSchema = bodyOf(accountFields);

/** Criar a conta: o perfil e a senha. */
export const registerSchema = bodyOf({ ...accountFields, password: passwordSchema });

/** Trocar a senha. A atual só é lida: quem decide se confere é o banco. */
export const changePasswordSchema = bodyOf({
  currentPassword: z.preprocess(value => String(value ?? ''), z.string()),
  newPassword: passwordSchema,
});

/** Cliente de balcão: o contato é opcional, mas o que vier precisa servir. */
export const customerSchema = bodyOf({
  name: z.preprocess(normalizeName, z.string()
    .min(2, { error: "Nome é obrigatório" })
    .max(120, { error: "Nome é obrigatório" })),
  phone: z.preprocess(normalizePhone, z.string()
    .refine(phone => phone === '' || isValidPhone(phone), { error: "Informe um telefone válido com DDD." })
    .transform(phone => (phone === '' ? null : phone))),
  email: z.preprocess(optionalEmail, z.string().refine(isValidEmail, { error: "O e-mail informado não parece válido." }).nullable()),
});

export type CustomerBody = z.output<typeof customerSchema>;

export function parseCustomerBody(body: unknown): ParseResult<CustomerBody> {
  return parseWith(customerSchema, body);
}

/** Corpo com um `name` de marca ou categoria: aparado, de 1 a 100 caracteres. */
export const labelBody = (message: string) => bodyOf({
  name: z.preprocess(normalizeName, z.string().min(1, { error: message }).max(100, { error: message })),
});

/** Id de rota: inteiro positivo, ou `null`. `Number("abc")` vira NaN e cairia no 500. */
export function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
