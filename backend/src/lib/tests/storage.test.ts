import { afterEach, describe, expect, it } from 'vitest';

import { isAllowedImageUrl, productImageUploadSchema } from '../storage.js';
import { parseWith } from '../validate.js';

const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

afterEach(() => {
  for (const [name, value] of [['SUPABASE_URL', original.url], ['SUPABASE_SERVICE_ROLE_KEY', original.key]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('isAllowedImageUrl', () => {
  it('com storage configurado, só aceita o bucket do projeto', () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';

    expect(isAllowedImageUrl('https://proj.supabase.co/storage/v1/object/public/produtos/fotos/a.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://evil.example/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://proj.supabase.co/storage/v1/object/public/outro/a.jpg')).toBe(false);
  });

  it('sem storage configurado, não bloqueia', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(isAllowedImageUrl('https://qualquer.coisa/a.jpg')).toBe(true);
  });
});

describe('productImageUploadSchema', () => {
  const erro = (body: unknown) => { const r = parseWith(productImageUploadSchema, body); return r.ok ? null : r.error; };

  it.each(['image/jpeg', 'image/png', 'image/webp'])('aceita %s', (contentType) => {
    expect(parseWith(productImageUploadSchema, { contentType, size: 1000 })).toEqual({ ok: true, data: { contentType, size: 1000 } });
  });

  it.each(['image/gif', 'image/svg+xml', 'text/html', 'application/pdf', '', undefined, 7])('recusa o tipo %j', (contentType) => {
    expect(erro({ contentType, size: 1000 })).toBe('Envie uma imagem JPG, PNG ou WebP.');
  });

  it('o tamanho vai de 1 byte até 5 MB', () => {
    expect(parseWith(productImageUploadSchema, { contentType: 'image/png', size: 5 * 1024 * 1024 }).ok).toBe(true);

    for (const size of [0, -1, 5 * 1024 * 1024 + 1, 'abc', undefined, null, Infinity]) {
      expect(erro({ contentType: 'image/png', size }), String(size)).toBe('A imagem precisa ter até 5 MB.');
    }
  });

  it('valida o tipo antes do tamanho', () => {
    expect(erro({ contentType: 'text/html', size: -1 })).toBe('Envie uma imagem JPG, PNG ou WebP.');
  });
});
