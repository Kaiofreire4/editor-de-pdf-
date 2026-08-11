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
  if (!arquivo || typeof (arquivo as File).arrayBuffer !== 'function') return resposta(400, { error: 'Ícone ausente' });
  const imagem = arquivo as File;
  if (!ALLOWED_TYPES.has(imagem.type)) return resposta(400, { error: 'Use PNG, JPG ou WebP' });
  if (imagem.size === 0 || imagem.size > MAX_ICON_SIZE) return resposta(400, { error: 'O ícone deve ter até 1 MB' });

  await icons().set(usuario.id, await imagem.arrayBuffer(), {
    metadata: { contentType: imagem.type },
  });
  return resposta(200, { saved: true });
};
