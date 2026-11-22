import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseId, parseLabel } from '../lib/validation.js';

export async function getAll(_req: Request, res: Response) {
  try {
    const brands = await prisma.brand.findMany();
    return res.json(brands);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar marcas" });
  }
}

export async function create(req: Request, res: Response) {
  const name = parseLabel(req.body?.name);
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  try {
    const created = await prisma.brand.create({ data: { name } });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Erro ao criar marca:", error);
    return res.status(500).json({ error: "Erro ao criar marca" });
  }
}

export async function update(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Marca inválida." });

  const name = parseLabel(req.body?.name);
  if (!name) return res.status(400).json({ error: "O novo nome é obrigatório" });

  try {
    const updated = await prisma.brand.update({ where: { id }, data: { name } });
    return res.json(updated);
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Marca não encontrada." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao atualizar marca:", error);
    return res.status(500).json({ error: "Erro ao atualizar marca" });
  }
}

export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Marca inválida." });

  try {
    await prisma.brand.delete({
      where: { id },
    });
    
    return res.status(204).send(); 
  } catch (error) {
    const translated = translatePrismaError(error, {
      inUse: "Esta marca tem produtos que já foram vendidos, então não pode ser apagada. Apague antes os produtos que ainda não têm venda.",
      notFound: "Marca não encontrada."
    });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao deletar a marca:", error);
    return res.status(500).json({ error: "Erro ao deletar a marca" });
  }
}