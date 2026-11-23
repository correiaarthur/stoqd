import type { Request, Response } from 'express';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getShowcase, getShowcaseFacets } from '../../src/controllers/products.controller.js';
import { criarMarca, criarProduto } from '../helpers/factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from '../helpers/testDb.js';

/**
 * A vitrine paginada. O que importa aqui é o que a rolagem infinita promete:
 * percorrer todas as páginas entrega cada produto exatamente uma vez, na mesma
 * ordem, e o filtro vale para o catálogo inteiro — não só para a página que já
 * chegou.
 */

beforeAll(() => { aplicarMigrations(); });
beforeEach(async () => { await limparBanco(); });
afterAll(async () => { await fecharBanco(); });

type Page = { items: Array<{ id: number; name: string; quantity: number; brand: { name: string } | null }>; nextCursor: string | null; total: number };
type Facets = {
  total: number;
  promo: number;
  brands: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  featured: { name: string } | null;
  highlights: Array<{ name: string }>;
};

async function chamar<T>(handler: (req: Request, res: Response) => unknown, query: Record<string, unknown>) {
  const capturado = { status: 200, body: null as unknown };
  const res = {
    status(code: number) { capturado.status = code; return res; },
    json(body: unknown) { capturado.body = body; return res; },
  };
  await handler({ query } as unknown as Request, res as unknown as Response);
  return { status: capturado.status, body: capturado.body as T };
}

const pagina = (query: Record<string, unknown>) => chamar<Page>(getShowcase, query);

async function todasAsPaginas(query: Record<string, unknown>) {
  const nomes: string[] = [];
  let cursor: string | null = null;
  let voltas = 0;
  do {
    const { body } = await pagina({ ...query, ...(cursor ? { cursor } : {}) });
    nomes.push(...body.items.map(i => i.name));
    cursor = body.nextCursor;
    voltas++;
  } while (cursor && voltas < 50);
  return { nomes, voltas };
}

async function catalogo(comEstoque: string[], esgotados: string[]) {
  const brandId = (await criarMarca()).id;
  for (const nome of comEstoque) await criarProduto({ nome, quantidade: 2, brandId });
  for (const nome of esgotados) await criarProduto({ nome, quantidade: 0, brandId });
}

describe('GET /products/showcase — paginação', () => {
  it('percorre o catálogo inteiro, cada produto uma vez, em ordem alfabética', async () => {
    const brandId = (await criarMarca('Natura')).id;
    for (let i = 0; i < 7; i++) {
      await criarProduto({ nome: `Produto ${String(i).padStart(2, '0')}`, quantidade: 3, brandId });
    }

    const { nomes, voltas } = await todasAsPaginas({ limit: '3' });

    expect(voltas).toBe(3);
    expect(nomes).toEqual([...nomes].sort());
    expect(new Set(nomes).size).toBe(7);
  });

  it('a última página diz que acabou', async () => {
    await criarProduto({ nome: 'Único', quantidade: 1 });

    const { body } = await pagina({ limit: '5' });

    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(1);
  });

  it('produto cadastrado no meio da rolagem não faz repetir item', async () => {
    const brandId = (await criarMarca()).id;
    for (const nome of ['B', 'D', 'F', 'H']) await criarProduto({ nome, quantidade: 1, brandId });

    const primeira = await pagina({ limit: '2' });
    await criarProduto({ nome: 'A', quantidade: 1, brandId }); // entra antes do cursor
    const segunda = await pagina({ limit: '2', cursor: primeira.body.nextCursor });

    expect(primeira.body.items.map(i => i.name)).toEqual(['B', 'D']);
    expect(segunda.body.items.map(i => i.name)).toEqual(['F', 'H']);
  });
});

describe('GET /products/showcase — esgotados no fim', () => {
  it('todos com estoque primeiro, depois os esgotados, cada grupo em ordem alfabética', async () => {
    await catalogo(['Bala', 'Doce', 'Mel'], ['Açaí', 'Café', 'Zimbro']);

    const { nomes } = await todasAsPaginas({ limit: '2' });

    expect(nomes).toEqual(['Bala', 'Doce', 'Mel', 'Açaí', 'Café', 'Zimbro']);
  });

  it('página que termina exatamente onde acabam os com estoque ainda leva aos esgotados', async () => {
    await catalogo(['Bala', 'Doce'], ['Açaí']);

    const primeira = await pagina({ limit: '2' });
    expect(primeira.body.items.map(i => i.name)).toEqual(['Bala', 'Doce']);
    expect(primeira.body.nextCursor).toBe('o:');

    const segunda = await pagina({ limit: '2', cursor: primeira.body.nextCursor });
    expect(segunda.body.items.map(i => i.name)).toEqual(['Açaí']);
    expect(segunda.body.nextCursor).toBeNull();
  });

  it('uma página pode atravessar a fronteira entre os dois grupos', async () => {
    await catalogo(['Bala'], ['Açaí', 'Café']);

    const { body } = await pagina({ limit: '2' });

    expect(body.items.map(i => i.name)).toEqual(['Bala', 'Açaí']);
    expect((await pagina({ limit: '2', cursor: body.nextCursor })).body.items.map(i => i.name)).toEqual(['Café']);
  });

  it('só esgotados: a vitrine mostra todos, sem página vazia no começo', async () => {
    await catalogo([], ['Açaí', 'Café']);

    const { body } = await pagina({ limit: '5' });

    expect(body.items.map(i => i.name)).toEqual(['Açaí', 'Café']);
    expect(body.nextCursor).toBeNull();
  });

  it('o filtro vale nas duas fases', async () => {
    const avon = (await criarMarca('Avon')).id;
    const natura = (await criarMarca('Natura')).id;
    await criarProduto({ nome: 'A com', quantidade: 1, brandId: avon });
    await criarProduto({ nome: 'A sem', quantidade: 0, brandId: avon });
    await criarProduto({ nome: 'N com', quantidade: 1, brandId: natura });
    await criarProduto({ nome: 'N sem', quantidade: 0, brandId: natura });

    const { nomes } = await todasAsPaginas({ limit: '1', brand: 'Natura' });

    expect(nomes).toEqual(['N com', 'N sem']);
  });
});

describe('GET /products/showcase — filtros valem para o catálogo inteiro', () => {
  it('marca filtra além da primeira página, e o total conta só o filtrado', async () => {
    const avon = (await criarMarca('Avon')).id;
    const natura = (await criarMarca('Natura')).id;
    for (let i = 0; i < 5; i++) await criarProduto({ nome: `A${i}`, quantidade: 1, brandId: avon });
    for (let i = 0; i < 5; i++) await criarProduto({ nome: `Z${i}`, quantidade: 1, brandId: natura });

    // Os Natura começam com Z: em ordem alfabética, nenhum cabe na primeira página.
    const { body } = await pagina({ limit: '3', brand: 'Natura' });

    expect(body.items.every(i => i.brand?.name === 'Natura')).toBe(true);
    expect(body.total).toBe(5);
  });

  it('promoção traz só o que getActivePrice cobra com desconto', async () => {
    await criarProduto({ nome: 'Cheio', quantidade: 1 });
    await criarProduto({ nome: 'Zerado', quantidade: 1, promocional: 0 });
    await criarProduto({ nome: 'Oferta', quantidade: 1, preco: 50, promocional: 40 });

    const { body } = await pagina({ promo: '1' });

    expect(body.items.map(i => i.name)).toEqual(['Oferta']);
  });

  it('busca ignora maiúsculas e olha nome e marca', async () => {
    const eudora = (await criarMarca('Eudora')).id;
    await criarProduto({ nome: 'Shampoo Cachos', quantidade: 1, brandId: eudora });
    await criarProduto({ nome: 'Sabonete', quantidade: 1 });

    expect((await pagina({ q: 'SHAMPOO' })).body.items.map(i => i.name)).toEqual(['Shampoo Cachos']);
    expect((await pagina({ q: 'eudora' })).body.items.map(i => i.name)).toEqual(['Shampoo Cachos']);
  });
});

describe('GET /products/showcase/facets', () => {
  it('conta por marca no catálogo inteiro e esconde marca sem produto', async () => {
    const avon = (await criarMarca('Avon')).id;
    await criarMarca('Vazia');
    await criarProduto({ nome: 'A1', quantidade: 1, brandId: avon });
    await criarProduto({ nome: 'A2', quantidade: 1, brandId: avon, preco: 30, promocional: 20 });

    const { body } = await chamar<Facets>(getShowcaseFacets, {});

    expect(body.total).toBe(2);
    expect(body.promo).toBe(1);
    expect(body.brands).toEqual([{ name: 'Avon', count: 2 }]);
  });

  it('destaque prefere promoção com estoque; sem ela, o mais caro disponível', async () => {
    await criarProduto({ nome: 'Promo esgotada', quantidade: 0, preco: 90, promocional: 80 });
    await criarProduto({ nome: 'Caro', quantidade: 2, preco: 200 });
    await criarProduto({ nome: 'Barato', quantidade: 2, preco: 10 });

    expect((await chamar<Facets>(getShowcaseFacets, {})).body.featured?.name).toBe('Caro');

    await criarProduto({ nome: 'Promo viva', quantidade: 1, preco: 50, promocional: 30 });
    expect((await chamar<Facets>(getShowcaseFacets, {})).body.featured?.name).toBe('Promo viva');
  });

  it('traz até três destaques: promoções com estoque primeiro, depois os mais caros, sem repetir', async () => {
    await criarProduto({ nome: 'Promo esgotada', quantidade: 0, preco: 90, promocional: 80 });
    await criarProduto({ nome: 'Promo viva', quantidade: 1, preco: 50, promocional: 30 });
    await criarProduto({ nome: 'Caro', quantidade: 2, preco: 200 });
    await criarProduto({ nome: 'Médio', quantidade: 2, preco: 100 });
    await criarProduto({ nome: 'Barato', quantidade: 2, preco: 10 });

    const { body } = await chamar<Facets>(getShowcaseFacets, {});

    expect(body.highlights.map(h => h.name)).toEqual(['Promo viva', 'Caro', 'Médio']);
    expect(body.featured?.name).toBe('Promo viva');
  });

  it('com menos de três produtos disponíveis, traz os que há', async () => {
    await criarProduto({ nome: 'Único', quantidade: 1, preco: 50 });
    await criarProduto({ nome: 'Esgotado', quantidade: 0, preco: 99 });

    const { body } = await chamar<Facets>(getShowcaseFacets, {});

    expect(body.highlights.map(h => h.name)).toEqual(['Único']);
  });

  it('catálogo vazio não quebra', async () => {
    const { status, body } = await chamar<Facets>(getShowcaseFacets, {});

    expect(status).toBe(200);
    expect(body).toMatchObject({ total: 0, promo: 0, featured: null, highlights: [] });
    expect(await testPrisma.product.count()).toBe(0);
  });
});
