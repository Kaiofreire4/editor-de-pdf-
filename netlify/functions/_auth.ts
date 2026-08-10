import { getStore } from '@netlify/blobs';
import * as crypto from 'node:crypto';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  hash: string;
  salt: string;
  criadoEm: number;
}

interface Sessao { email: string; expiraEm: number; }

const diasSessao = 30 * 24 * 60 * 60 * 1000;
const usuarios = () => getStore('pdfmaster-users');
const sessoes = () => getStore('pdfmaster-sessions');

export function gerarHash(senha: string, salt: string): string {
  return crypto.pbkdf2Sync(senha, salt, 100_000, 64, 'sha256').toString('hex');
}

export function gerarToken(): string { return crypto.randomBytes(32).toString('hex'); }

export async function usuarioPorEmail(email: string): Promise<Usuario | null> {
  return (await usuarios().get(email.toLowerCase(), { type: 'json' })) as Usuario | null;
}

export async function usuarioPorToken(token: string | null): Promise<Usuario | null> {
  if (!token) return null;
  const sessao = (await sessoes().get(token, { type: 'json' })) as Sessao | null;
  if (!sessao || sessao.expiraEm < Date.now()) {
    if (sessao) await sessoes().delete(token);
    return null;
  }
  return usuarioPorEmail(sessao.email);
}

export function tokenDoEvento(event: { headers: Record<string, string | undefined> }): string | null {
  const header = event.headers.authorization || event.headers.Authorization;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function resposta(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

export async function salvarSessao(email: string): Promise<string> {
  const token = gerarToken();
  await sessoes().setJSON(token, { email, expiraEm: Date.now() + diasSessao });
  return token;
}
