import type { Handler } from '@netlify/functions';
import { corpoJson, gerarHash, resposta, salvarSessao, usuarioPorEmail } from './_auth';

export const handler: Handler = async (event) => {
  try {
    const { email, senha } = corpoJson(event);
    const emailNorm = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const usuario = await usuarioPorEmail(emailNorm);
    if (!usuario || typeof senha !== 'string' || gerarHash(senha, usuario.salt) !== usuario.hash) return resposta(401, { error: 'E-mail ou senha inválidos' });
    const token = await salvarSessao(usuario.email);
    return resposta(200, { token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch { return resposta(401, { error: 'E-mail ou senha inválidos' }); }
};
