import type { Request, Response } from 'express';

import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  createProductImageUpload,
  isStorageConfigured,
} from '../lib/storage.js';

/** Admin pede permissão para enviar UMA foto; o arquivo vai direto ao bucket. */
export async function productImage(req: Request, res: Response) {
  const contentType = String(req.body?.contentType ?? '');
  const size = Number(req.body?.size);

  if (!(contentType in IMAGE_TYPES)) {
    return res.status(400).json({ error: "Envie uma imagem JPG, PNG ou WebP." });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: `A imagem precisa ter até ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` });
  }
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
