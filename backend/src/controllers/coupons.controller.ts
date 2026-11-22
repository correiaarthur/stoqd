import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseCouponBody } from '../lib/coupons.js';
import { parseId } from '../lib/validation.js';

export async function list(_req: Request, res: Response) {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { sales: true } } },
    });

    const now = Date.now();

    return res.json(coupons.map((coupon) => ({
      ...coupon,
      // O estado que importa na tela não é só `active`: um cupom ligado que
      // venceu ou esgotou também não funciona, e a lista precisa dizer isso.
      status: !coupon.active ? 'inactive'
        : coupon.expiresAt && coupon.expiresAt.getTime() <= now ? 'expired'
        : coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses ? 'exhausted'
        : 'active',
    })));
  } catch (error) {
    console.error("Erro ao listar cupons:", error);
    return res.status(500).json({ error: "Erro ao buscar cupons." });
  }
}

export async function create(req: Request, res: Response) {
  const parsed = parseCouponBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const coupon = await prisma.coupon.create({ data: parsed.data });
    return res.status(201).json(coupon);
  } catch (error) {
    const translated = translatePrismaError(error, { duplicate: "Já existe um cupom com este código." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao criar cupom:", error);
    return res.status(500).json({ error: "Não foi possível criar o cupom." });
  }
}

export async function update(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Cupom inválido." });

  const parsed = parseCouponBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    // `usedCount` fica de fora de propósito: editar um cupom não pode apagar o
    // rastro de quantas vezes ele já foi usado.
    const coupon = await prisma.coupon.update({ where: { id }, data: parsed.data });
    return res.json(coupon);
  } catch (error) {
    const translated = translatePrismaError(error, {
      duplicate: "Já existe um cupom com este código.",
      notFound: "Cupom não encontrado.",
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao editar cupom:", error);
    return res.status(500).json({ error: "Não foi possível editar o cupom." });
  }
}

/**
 * Desativa em vez de apagar quando o cupom já foi usado: a venda aponta para
 * ele, e apagar deixaria "por que esta venda saiu mais barata?" sem resposta.
 */
export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Cupom inválido." });

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { sales: true, orders: true } } },
    });

    if (!coupon) return res.status(404).json({ error: "Cupom não encontrado." });

    if (coupon._count.sales > 0 || coupon._count.orders > 0) {
      const deactivated = await prisma.coupon.update({ where: { id }, data: { active: false } });

      return res.status(200).json({
        ...deactivated,
        message: "Este cupom já foi usado em vendas, então foi desativado em vez de apagado — o histórico continua fazendo sentido.",
      });
    }

    await prisma.coupon.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao apagar cupom:", error);
    return res.status(500).json({ error: "Não foi possível apagar o cupom." });
  }
}
