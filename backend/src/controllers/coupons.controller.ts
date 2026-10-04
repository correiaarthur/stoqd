import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { type CouponRow, isValidCouponCode, normalizeCouponCode } from '../lib/coupons.js';

/**
 * O que o corpo da requisição pode definir: a linha inteira menos o que é do
 * banco. `id` é do autoincremento e `usedCount` só sobe quando uma venda gasta
 * o cupom — nenhum dos dois se aceita de fora.
 */
type ParsedCoupon = Omit<CouponRow, 'id' | 'usedCount'>;

function parseBody(body: any): { ok: true; data: ParsedCoupon } | { ok: false; error: string } {
  const code = normalizeCouponCode(body?.code);

  if (!isValidCouponCode(code)) {
    return { ok: false, error: "O código precisa ter de 3 a 24 letras, números ou hífen." };
  }

  const type = body?.type === 'FIXED' ? 'FIXED' : 'PERCENT';
  const value = Number(body?.value);

  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Informe o valor do desconto." };
  }
  if (type === 'PERCENT' && value > 100) {
    return { ok: false, error: "Um desconto percentual não pode passar de 100%." };
  }

  const minimumTotal = body?.minimumTotal === '' || body?.minimumTotal == null
    ? null
    : Number(body.minimumTotal);

  if (minimumTotal !== null && (!Number.isFinite(minimumTotal) || minimumTotal < 0)) {
    return { ok: false, error: "Pedido mínimo inválido." };
  }

  const maxUses = body?.maxUses === '' || body?.maxUses == null ? null : Number(body.maxUses);

  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    return { ok: false, error: "O limite de usos precisa ser um número inteiro maior que zero." };
  }

  let expiresAt: Date | null = null;

  if (body?.expiresAt) {
    // O input date manda "2026-09-30", que `new Date` lê como meia-noite UTC.
    // Aplicar setHours local depois disso empurra o vencimento para o dia
    // ANTERIOR aqui (UTC-3) — um cupom "válido até 30/09" morreria em 29/09.
    // Montando a data campo a campo, ela nasce local e o fim do dia é o fim
    // do dia certo.
    const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.expiresAt).trim());

    const parsed = dayOnly
      ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]), 23, 59, 59, 999)
      : new Date(String(body.expiresAt));

    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Data de validade inválida." };
    }

    if (!dayOnly) parsed.setHours(23, 59, 59, 999);

    expiresAt = parsed;
  }

  return { ok: true, data: { code, type, value, minimumTotal, expiresAt, maxUses, active: body?.active !== false } };
}

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
  const parsed = parseBody(req.body);
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Cupom inválido." });

  const parsed = parseBody(req.body);
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Cupom inválido." });

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
