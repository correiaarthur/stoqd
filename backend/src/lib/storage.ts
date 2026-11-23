import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { bodyOf } from './validate.js';

/**
 * Upload de foto de produto, assinado pelo servidor.
 *
 * O navegador não escreve mais no bucket com a chave anon (que é pública, vai
 * no bundle): o admin pede aqui uma URL de envio de uso único, para um caminho
 * que o servidor escolhe, e só então manda o arquivo. O bucket pode ficar sem
 * policy de INSERT para `anon`.
 */
export const PRODUCT_BUCKET = 'produtos';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const IMAGE_TYPE_NAMES = Object.keys(IMAGE_TYPES) as [string, ...string[]];
const MSG_TAMANHO = `A imagem precisa ter até ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;

/** O que o admin diz da foto antes de enviar: o tipo e o tamanho, que o servidor confere. */
export const productImageUploadSchema = bodyOf({
  contentType: z.preprocess(
    value => String(value ?? ''),
    z.enum(IMAGE_TYPE_NAMES, { error: "Envie uma imagem JPG, PNG ou WebP." })
  ),
  size: z.coerce.number({ error: MSG_TAMANHO })
    .positive({ error: MSG_TAMANHO })
    .max(MAX_IMAGE_BYTES, { error: MSG_TAMANHO }),
});

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function isStorageConfigured(): boolean {
  return config() !== null;
}

/** Prefixo público do bucket; `null` quando o storage não está configurado. */
export function publicImagePrefix(): string | null {
  const cfg = config();
  return cfg ? `${cfg.url}/storage/v1/object/public/${PRODUCT_BUCKET}/` : null;
}

/**
 * `imageUrl` só vale se apontar para o nosso bucket — senão o admin (ou um token
 * roubado) põe qualquer endereço externo na vitrine pública. Sem storage
 * configurado, não há como saber qual é "o nosso": aceita, como antes.
 */
export function isAllowedImageUrl(url: string): boolean {
  const prefix = publicImagePrefix();
  return prefix === null || url.startsWith(prefix);
}

export async function createProductImageUpload(contentType: string) {
  const cfg = config();
  if (!cfg) throw new Error('Storage não configurado.');

  const extension = IMAGE_TYPES[contentType];
  if (!extension) throw new Error('Tipo de imagem não aceito.');

  const supabase = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
  const path = `fotos/${randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage.from(PRODUCT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error('Falha ao assinar o upload.');

  const { data: pub } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);

  return { path, token: data.token, publicUrl: pub.publicUrl };
}
