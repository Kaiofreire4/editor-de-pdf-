import { getStore } from '@netlify/blobs';
import { resposta, tokenDoRequest, usuarioPorToken } from './_auth.mjs';

const MAX_ICON_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const icons = () => getStore('pdfmaster-profile-icons');

export default async (request: Request) => {
  const usuario = await usuarioPorToken(tokenDoRequest(request));
  if (!usuario) return resposta(401, { error: 'Não autenticado' });

  if (request.method === 'GET') {
    const entry = await icons().getWithMetadata(usuario.id, { type: 'arrayBuffer', consistency: 'strong' });
    if (!entry || !entry.data) return new Response(null, { status: 404 });
    return new Response(entry.data, {
      status: 200,
      headers: {
        'content-type': String(entry.metadata?.contentType || 'image/png'),
        'cache-control': 'private, no-store',
      },
    });
  }

  if (request.method === 'DELETE') {
    await icons().delete(usuario.id);
    return resposta(204, null);
  }

  if (request.method !== 'PUT') return resposta(405, { error: 'Método não permitido' });

  const formData = await request.formData();
  const arquivo = formData.get('icon');
  if (!(arquivo instanceof File)) return resposta(400, { error: 'Ícone ausente' });
  if (!ALLOWED_TYPES.has(arquivo.type)) return resposta(400, { error: 'Use PNG, JPG ou WebP' });
  if (arquivo.size === 0 || arquivo.size > MAX_ICON_SIZE) return resposta(400, { error: 'O ícone deve ter até 1 MB' });

  await icons().set(usuario.id, await arquivo.arrayBuffer(), {
    metadata: { contentType: arquivo.type },
  });
  return resposta(200, { saved: true });
};
