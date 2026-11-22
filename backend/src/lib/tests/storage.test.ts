import { afterEach, describe, expect, it } from 'vitest';

import { isAllowedImageUrl } from '../storage.js';

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
