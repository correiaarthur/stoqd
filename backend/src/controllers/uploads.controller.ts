import type { Request, Response } from 'express';

import { createProductImageUpload, isStorageConfigured, productImageUploadSchema } from '../lib/storage.js';
import { parseWith } from '../lib/validate.js';

/** Admin pede permissão para enviar UMA foto; o arquivo vai direto ao bucket. */
export async function productImage(req: Request, res: Response) {
  const body = parseWith(productImageUploadSchema, req.body);
  if (!body.ok) return res.status(400).json({ error: body.error });

  const { contentType } = body.data;

  if (!isStorageConfigured()) {
    return res.status(503).json({ error: "O envio de imagens não está configurado no servidor." });
  }

  try {
    return res.json(await createProductImageUpload(contentType));
  } catch (error) {
    console.error("Erro ao assinar o upload:", error);
    return res.status(500).json({ error: "Não foi possível preparar o envio da imagem." });
  }
}
