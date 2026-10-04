import { type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getActivePrice } from "../lib/pricing.js";
import { withAvailability } from "../lib/availability.js";
import { parseCartToken } from "../lib/cartItems.js";
import { translatePrismaError } from "../lib/prismaErrors.js";
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
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) {
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

export async function getShowcase(req: Request, res: Response) {
  const cartToken = parseCartToken(req.query.cartToken);

  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        imageUrl: true,
        quantity: true,
        sellingPrice: true,
        promotionalPrice: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    const withStock = await withAvailability(products, cartToken ? { excludeCartToken: cartToken } : {});

    const showcaseProducts = withStock.map((product) => ({
      ...product,
      activePrice: getActivePrice(product),
    }));

    return res.json(showcaseProducts);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao buscar produtos" });
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
  const { id } = req.params;

  try {
    await prisma.product.delete({
      where: { id: Number(id) },
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
