import { type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getActivePrice } from "../lib/pricing.js";
import { withAvailability } from "../lib/availability.js";
import { parseCartToken } from "../lib/cartItems.js";
import { buildShowcaseWhere, encodeShowcaseCursor, parseShowcaseQuery, PROMO_WHERE } from "../lib/showcaseQuery.js";
import { translatePrismaError } from "../lib/prismaErrors.js";
import { parseId } from "../lib/validation.js";
import { mergeAverageCost, mergeExpiryDates, parseProductInput } from "../lib/productInput.js";

/**
 * Cadastro de produto.
 *
 * `POST` é upsert por nome: um produto que já existe recebe o lote novo em vez
 * de dar erro de nome duplicado — reabastecer é a operação mais comum da loja.
 * Quem valida o corpo é `parseProductInput`, antes de qualquer consulta: era por
 * aqui que quantidade negativa e custo zero entravam.
 */
export async function upsert(req: Request, res: Response) {
  const parsed = parseProductInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const entrada = parsed.data;

  try {
    const existente = await prisma.product.findUnique({ where: { name: entrada.name } });

    if (existente) {
      const quantidadeTotal = existente.quantity + entrada.quantity;

      const atualizado = await prisma.product.update({
        where: { id: existente.id },
        data: {
          quantity: quantidadeTotal,
          averageCost: mergeAverageCost(existente, entrada),
          // No reabastecimento, campo vazio significa "mantém o que está lá" —
          // quem está dando entrada em lote não redigita o preço de venda.
          sellingPrice: entrada.sellingPrice > 0 ? entrada.sellingPrice : existente.sellingPrice,
          promotionalPrice: entrada.promotionalPrice ?? existente.promotionalPrice,
          categoryId: entrada.categoryId ?? existente.categoryId,
          expiryDate: mergeExpiryDates(existente.expiryDate, entrada.expiryDate),
          imageUrl: entrada.imageUrl ?? existente.imageUrl,
        },
      });

      return res.status(200).json(atualizado);
    }

    const criado = await prisma.product.create({
      data: {
        name: entrada.name,
        brandId: entrada.brandId,
        categoryId: entrada.categoryId,
        quantity: entrada.quantity,
        averageCost: entrada.averageCost,
        sellingPrice: entrada.sellingPrice,
        promotionalPrice: entrada.promotionalPrice,
        expiryDate: entrada.expiryDate,
        imageUrl: entrada.imageUrl,
      },
    });

    return res.status(201).json(criado);
  } catch (error) {
    const translated = translatePrismaError(error, {
      duplicate: "Já existe um produto com este nome.",
      inUse: "A marca ou a categoria escolhida não existe mais.",
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro no upsert:", error);
    return res.status(500).json({ error: "Erro ao processar produto" });
  }
}

/** Edição: substitui os campos, sem somar estoque. */
export async function update(req: Request, res: Response) {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(400).json({ error: "Produto inválido." });
  }

  const parsed = parseProductInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const atualizado = await prisma.product.update({
      where: { id: productId },
      data: parsed.data,
    });

    return res.status(200).json(atualizado);
  } catch (error) {
    const translated = translatePrismaError(error, {
      duplicate: "Já existe um produto com este nome.",
      notFound: "Produto não encontrado.",
      inUse: "A marca ou a categoria escolhida não existe mais.",
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao editar produto:", error);
    return res.status(500).json({ error: "Erro ao editar produto" });
  }
}

/** O que a vitrine mostra de um produto — custo e lucro não saem daqui. */
const SHOWCASE_SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  quantity: true,
  sellingPrice: true,
  promotionalPrice: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} as const;

/**
 * Uma página da vitrine, já filtrada.
 *
 * Primeiro tudo o que tem estoque, em ordem alfabética; depois os esgotados,
 * também em ordem alfabética. Uma página pode atravessar a fronteira: as
 * últimas com estoque e os primeiros esgotados.
 *
 * "Esgotado" aqui é o estoque físico (`quantity`). A reserva de outra pessoa
 * não é coluna que o banco ordene, então um produto com tudo reservado fica
 * no seu lugar alfabético e aparece como esgotado só no selo.
 *
 * Paginação por cursor, não por número de página: o nome é único, a ordem é
 * estável, e um produto cadastrado no meio da rolagem não faz ninguém ver o
 * mesmo item duas vezes — o que aconteceria com `skip`.
 */
export async function getShowcase(req: Request, res: Response) {
  const cartToken = parseCartToken(req.query.cartToken);
  const filters = parseShowcaseQuery(req.query as Record<string, unknown>);
  const where = buildShowcaseWhere(filters);
  const { limit, cursor } = filters;

  const phaseWhere = (phase: 'in' | 'out') => ({
    AND: [where, { quantity: phase === 'in' ? { gt: 0 } : { lte: 0 } }],
  });
  const pageOf = (phase: 'in' | 'out', take: number, afterId: number | null) =>
    prisma.product.findMany({
      where: phaseWhere(phase),
      select: SHOWCASE_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    });

  try {
    const totalPromise = prisma.product.count({ where });

    type Row = Awaited<ReturnType<typeof pageOf>>[number];
    let products: Row[] = [];
    let nextCursor: string | null = null;

    // Fase 1: com estoque. Um a mais que o pedido diz se há próxima página.
    if (!cursor || cursor.phase === 'in') {
      const page = await pageOf('in', limit + 1, cursor?.id ?? null);
      if (page.length > limit) {
        products = page.slice(0, limit);
        nextCursor = encodeShowcaseCursor('in', products[products.length - 1]!.id);
      } else {
        products = page;
      }
    }

    // Fase 2: esgotados — completa a página ou, se ela já está cheia, só
    // confere se existe algum para apontar o cursor para o começo deles.
    if (nextCursor === null) {
      const room = limit - products.length;
      const afterId = cursor?.phase === 'out' ? cursor.id : null;
      const page = await pageOf('out', room + 1, afterId);

      if (room === 0) {
        if (page.length > 0) nextCursor = encodeShowcaseCursor('out', null);
      } else if (page.length > room) {
        products = [...products, ...page.slice(0, room)];
        nextCursor = encodeShowcaseCursor('out', products[products.length - 1]!.id);
      } else {
        products = [...products, ...page];
      }
    }

    const withStock = await withAvailability(products, cartToken ? { excludeCartToken: cartToken } : {});

    return res.json({
      items: withStock.map((product) => ({ ...product, activePrice: getActivePrice(product) })),
      nextCursor,
      total: await totalPromise,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao buscar produtos" });
  }
}

/**
 * O que a vitrine precisa do catálogo **inteiro** e não pode tirar de uma
 * página: quantos produtos há em cada marca e tipo (os números dos chips),
 * quantos estão em promoção, o total e o produto em destaque.
 */
export async function getShowcaseFacets(req: Request, res: Response) {
  const cartToken = parseCartToken(req.query.cartToken);

  try {
    const [brands, categories, promo, total, promoCandidates, priceyCandidates] = await Promise.all([
      prisma.brand.findMany({
        select: { name: true, _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.category.findMany({
        select: { name: true, _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where: PROMO_WHERE }),
      prisma.product.count(),
      prisma.product.findMany({
        where: { ...PROMO_WHERE, quantity: { gt: 0 } },
        select: SHOWCASE_SELECT,
        orderBy: { name: 'asc' },
        take: 10,
      }),
      prisma.product.findMany({
        where: { quantity: { gt: 0 } },
        select: SHOWCASE_SELECT,
        orderBy: { sellingPrice: 'desc' },
        take: 10,
      }),
    ]);

    // Destaque: uma promoção que ainda tem para vender; sem ela, o produto
    // mais caro disponível. "Disponível" desconta as reservas de outras
    // pessoas — por isso os candidatos passam por `withAvailability`.
    const stockOptions = cartToken ? { excludeCartToken: cartToken } : {};
    const [promos, pricey] = await Promise.all([
      withAvailability(promoCandidates, stockOptions),
      withAvailability(priceyCandidates, stockOptions),
    ]);
    // Até três destaques: primeiro as promoções que ainda têm para vender, depois
    // os mais caros disponíveis, sem repetir. O primeiro é o `featured` de
    // sempre — mesma regra, agora acompanhado de mais dois.
    const picks: typeof pricey = [];
    const seen = new Set<number>();
    const add = (list: typeof pricey) => {
      for (const product of list) {
        if (picks.length >= 3) return;
        if (product.available > 0 && !seen.has(product.id)) {
          seen.add(product.id);
          picks.push(product);
        }
      }
    };
    add(promos);
    add([...pricey].sort((a, b) => getActivePrice(b) - getActivePrice(a)));
    const withPrice = (product: (typeof picks)[number]) => ({ ...product, activePrice: getActivePrice(product) });
    const featured = picks[0] ?? null;

    const counted = (list: Array<{ name: string; _count: { products: number } }>) =>
      list.filter(i => i._count.products > 0).map(i => ({ name: i.name, count: i._count.products }));

    return res.json({
      total,
      promo,
      brands: counted(brands),
      categories: counted(categories),
      featured: featured ? withPrice(featured) : null,
      highlights: picks.map(withPrice),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao buscar a vitrine" });
  }
}

export async function getAll(_req: Request, res: Response) {
  try {
    const products = await prisma.product.findMany({
      include: { brand: true, category: true },
    });

    // O estoque do admin mostra os dois números: `quantity` é o que está na
    // prateleira, `available` é o que sobra depois das reservas do site.
    const withStock = await withAvailability(products);

    const productsWithAnalytics = withStock.map((product) => {
      const activePrice = getActivePrice(product);

      const unitProfit = activePrice - product.averageCost;

      const totalExpectedProfit = unitProfit * product.quantity;

      return {
        ...product,
        activePrice,
        unitProfit,
        totalExpectedProfit,
      };
    });

    return res.json(productsWithAnalytics);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao buscar produtos" });
  }
}

export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Produto inválido." });

  try {
    await prisma.product.delete({
      where: { id },
    });
    return res.status(204).send();
  } catch (error) {
    const translated = translatePrismaError(error, {
      inUse: "Este produto já foi vendido e não pode ser apagado — o histórico das vendas deixaria de fazer sentido. Se ele saiu de linha, zere o estoque.",
      notFound: "Produto não encontrado."
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao eliminar produto:", error);
    return res.status(500).json({ error: "Erro ao eliminar produto" });
  }
}
