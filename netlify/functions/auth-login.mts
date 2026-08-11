import { corpoJson, gerarHash, resposta, salvarSessao, usuarioPorEmail } from './_auth.mjs';

export default async (request: Request) => {
  let dados: Record<string, unknown>;
  try {
    dados = await corpoJson(request);
  } catch { return resposta(400, { error: 'O corpo da requisição não contém JSON válido' }); }

  const { email, senha } = dados;
  const emailNorm = typeof email === 'string' ? email.toLowerCase().trim() : '';
  try {
    const usuario = await usuarioPorEmail(emailNorm);
    if (!usuario || typeof senha !== 'string' || gerarHash(senha, usuario.salt) !== usuario.hash) return resposta(401, { error: 'E-mail ou senha inválidos' });
    const token = await salvarSessao(usuario.email);
    return resposta(200, { token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error('Erro ao ler usuário no Netlify Blobs:', error);
    return resposta(500, { error: 'Não foi possível acessar o armazenamento de usuários da Netlify.' });
  }
};
