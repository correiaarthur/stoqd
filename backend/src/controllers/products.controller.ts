import { type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getActivePrice } from "../lib/pricing.js";
import { withAvailability } from "../lib/availability.js";
import { parseCartToken } from "../lib/cartItems.js";
import { translatePrismaError } from "../lib/prismaErrors.js";

async function createNewProduct(trimmedName: string, data: any) {
  return await prisma.product.create({
    data: {
      name: trimmedName,
      brandId: Number(data.brandId),
      categoryId: data.categoryId ? Number(data.categoryId) : null,
      quantity: Number(data.quantity) || 0,
      averageCost: Number(data.averageCost || 0),
      sellingPrice: Number(data.sellingPrice || 0),
      promotionalPrice: data.promotionalPrice ? Number(data.promotionalPrice) : null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      imageUrl: data.imageUrl,
    },
  });
}

// Um produto guarda uma única validade, mas o estoque pode juntar unidades de
// compras diferentes. Mantemos a data mais próxima: sinaliza o lote mais velho
// em vez de escondê-lo atrás da validade da entrada mais recente.
// (Controle real por lote exigiria uma tabela de lotes — ver README.)
function mergeExpiryDates(currentDate: Date | null, incomingDate: unknown) {
  const incoming = incomingDate ? new Date(String(incomingDate)) : null;

  if (!incoming || Number.isNaN(incoming.getTime())) return currentDate;
  if (!currentDate) return incoming;

  return incoming < currentDate ? incoming : currentDate;
}

async function addStockToExistingProduct(existingProduct: any, data: any) {
  const currentQty = Number(existingProduct.quantity) || 0;
  const currentCost = Number(existingProduct.averageCost) || 0;
  const incomingQty = Number(data.quantity) || 0;
  const incomingCost = Number(data.averageCost) || 0;

  const totalQuantity = currentQty + incomingQty;
  const newAverageCost = totalQuantity > 0
    ? (currentQty * currentCost + incomingQty * incomingCost) / totalQuantity
    : incomingCost;

  return await prisma.product.update({
    where: { id: existingProduct.id },
    data: {
      quantity: totalQuantity,
      averageCost: newAverageCost,
      sellingPrice: Number(data.sellingPrice) || existingProduct.sellingPrice,
      promotionalPrice: data.promotionalPrice ? Number(data.promotionalPrice) : existingProduct.promotionalPrice,
      categoryId: data.categoryId ? Number(data.categoryId) : existingProduct.categoryId,
      expiryDate: mergeExpiryDates(existingProduct.expiryDate, data.expiryDate),
      imageUrl: data.imageUrl || existingProduct.imageUrl,
    },
  });
}

export async function upsert(req: Request, res: Response) {
  const data = req.body;
  const trimmedName = data.name?.trim(); 

  try {
    const existingProduct = await prisma.product.findUnique({
      where: { name: trimmedName },
    });

    if (existingProduct) {
      const updatedProduct = await addStockToExistingProduct(existingProduct, data);
      return res.status(200).json(updatedProduct);
    }

    const newProduct = await createNewProduct(trimmedName, data);
    return res.status(201).json(newProduct);

  } catch (error) {
    const translated = translatePrismaError(error, {
      duplicate: "Já existe um produto com este nome."
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro no upsert:", error);
    return res.status(500).json({ error: "Erro ao processar produto" });
  }
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  const data = req.body;

  try {
    const updatedProduct = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        name: data.name?.trim(),
        brandId: Number(data.brandId),
        categoryId: data.categoryId ? Number(data.categoryId) : null,
        quantity: Number(data.quantity),
        averageCost: Number(data.averageCost) || 0,
        sellingPrice: Number(data.sellingPrice),
        promotionalPrice: data.promotionalPrice ? Number(data.promotionalPrice) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        imageUrl: data.imageUrl
      }
    });
    return res.status(200).json(updatedProduct);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao editar produto" });
  }
}

// A vitrine mostra o que dá para comprar agora, não o que existe na
// prateleira: uma unidade reservada por outra pessoa não pode aparecer
// disponível para esta. O carrinho de quem está olhando manda o próprio
// cartToken para não competir consigo mesmo pela última unidade.
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
