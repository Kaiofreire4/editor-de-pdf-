import { resposta, tokenDoRequest, usuarioPorToken } from './_auth.mjs';

export default async (request: Request) => {
  const usuario = await usuarioPorToken(tokenDoRequest(request));
  if (!usuario) return resposta(401, { error: 'Não autenticado' });
  return resposta(200, { user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
};
