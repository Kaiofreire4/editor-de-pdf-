import * as crypto from 'node:crypto';
import { corpoJson, gerarHash, resposta, salvarSessao, usuarioPorEmail, type Usuario } from './_auth';
import { getStore } from '@netlify/blobs';

export default async (request: Request) => {
  let dados: Record<string, unknown>;
  try {
    dados = await corpoJson(request);
  } catch { return resposta(400, { error: 'O corpo da requisição não contém JSON válido' }); }

  const { nome, email, senha } = dados;
  const emailNorm = typeof email === 'string' ? email.toLowerCase().trim() : '';
  if (typeof nome !== 'string' || nome.trim().length < 2 || nome.length > 80) return resposta(400, { error: 'Nome deve ter entre 2 e 80 caracteres' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return resposta(400, { error: 'E-mail inválido' });
  if (typeof senha !== 'string' || senha.length < 6 || senha.length > 128) return resposta(400, { error: 'A senha deve ter entre 6 e 128 caracteres' });

  try {
    if (await usuarioPorEmail(emailNorm)) return resposta(400, { error: 'Este e-mail já está cadastrado' });
    const salt = crypto.randomBytes(16).toString('hex');
    const usuario: Usuario = { id: crypto.randomUUID(), nome: nome.trim(), email: emailNorm, hash: gerarHash(senha, salt), salt, criadoEm: Date.now() };
    await getStore('pdfmaster-users').setJSON(emailNorm, usuario);
    const token = await salvarSessao(emailNorm);
    return resposta(201, { token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error('Erro ao gravar usuário no Netlify Blobs:', error);
    return resposta(500, { error: 'Não foi possível acessar o armazenamento de usuários da Netlify.' });
  }
};
