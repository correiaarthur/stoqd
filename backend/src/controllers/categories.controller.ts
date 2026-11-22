import { type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { translatePrismaError } from '../lib/prismaErrors.js';
import { parseWith } from '../lib/validate.js';
import { labelBody, parseId } from '../lib/validation.js';

export async function getAll(_req: Request, res: Response) {
  try {
    const categories = await prisma.category.findMany();
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar categorias" });
  }
}

export async function create(req: Request, res: Response) {
  const parsed = parseWith(labelBody("Nome é obrigatório"), req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { name } = parsed.data;

  try {
    const created = await prisma.category.create({ data: { name } });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return res.status(500).json({ error: "Erro ao criar categoria" });
  }
}

export async function update(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Categoria inválida." });

  const parsed = parseWith(labelBody("O novo nome é obrigatório"), req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { name } = parsed.data;

  try {
    const updated = await prisma.category.update({ where: { id }, data: { name } });
    return res.json(updated);
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Categoria não encontrada." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao atualizar categoria:", error);
    return res.status(500).json({ error: "Erro ao atualizar categoria" });
  }
}

export async function remove(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: "Categoria inválida." });

  try {
    await prisma.category.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    const translated = translatePrismaError(error, { notFound: "Categoria não encontrada." });
    if (translated) return res.status(translated.status).json({ error: translated.error });

    console.error("Erro ao deletar categoria:", error);
    return res.status(500).json({ error: "Erro ao deletar categoria" });
  }
}