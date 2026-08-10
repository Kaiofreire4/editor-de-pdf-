import type { Handler } from '@netlify/functions';
import { resposta, tokenDoEvento, usuarioPorToken } from './_auth';

export const handler: Handler = async (event) => {
  const usuario = await usuarioPorToken(tokenDoEvento(event));
  if (!usuario) return resposta(401, { error: 'Não autenticado' });
  return resposta(200, { user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
};
