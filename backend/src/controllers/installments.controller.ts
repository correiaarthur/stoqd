import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseId } from '../lib/validation.js';

/**
 * Marca uma parcela como paga.
 *
 * A checagem e a escrita são a mesma operação, pelo mesmo motivo do decremento
 * de estoque e da confirmação de pedido: ler `paidAt`, decidir, e só então
 * escrever deixa espaço para dois cliques passarem juntos. Hoje o estado final
 * seria o mesmo — paga é paga — mas as duas requisições responderiam sucesso, e
 * no dia em que registrar pagamento tiver efeito colateral (recibo, baixa no
 * caixa) seriam dois.
 */
export async function pay(req: Request, res: Response) {
  const installmentId = parseId(req.params.id);

  if (installmentId === null) {
    return res.status(400).json({ error: "Parcela inválida." });
  }

  try {
    const { count } = await prisma.installment.updateMany({
      where: { id: installmentId, paidAt: null },
      data: { paidAt: new Date() },
    });

    if (count === 1) {
      const paga = await prisma.installment.findUnique({ where: { id: installmentId } });
      return res.json(paga);
    }

    // Nenhuma linha afetada tem duas causas, e elas pedem respostas diferentes.
    const existente = await prisma.installment.findUnique({ where: { id: installmentId } });

    if (!existente) return res.status(404).json({ error: "Parcela não encontrada" });

    return res.status(409).json({ error: "Esta parcela já foi paga!" });
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Parcela não encontrada" });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao registrar o pagamento da parcela:", error);
    return res.status(500).json({ error: "Erro ao registrar o pagamento da parcela" });
  }
}
