import type { Handler } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { resposta, tokenDoEvento } from './_auth';

export const handler: Handler = async (event) => {
  const token = tokenDoEvento(event);
  if (token) await getStore('pdfmaster-sessions').delete(token);
  return resposta(200, { ok: true });
};
