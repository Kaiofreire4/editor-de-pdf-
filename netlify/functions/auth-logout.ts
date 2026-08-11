import { getStore } from '@netlify/blobs';
import { resposta, tokenDoRequest } from './_auth';

export default async (request: Request) => {
  const token = tokenDoRequest(request);
  if (token) await getStore('pdfmaster-sessions').delete(token);
  return resposta(200, { ok: true });
};
