import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from 'pdf-lib';
// @ts-ignore
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
// @ts-ignore
import swaggerJSDoc from 'swagger-jsdoc';
// @ts-ignore
import swaggerUi from 'swagger-ui-express';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import Database from 'better-sqlite3';

export const app = express();

const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;
const allowedOrigins = new Set([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  ...(process.env['CORS_ORIGIN'] ? process.env['CORS_ORIGIN'].split(',').map((value) => value.trim()) : []),
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream') {
      callback(null, true);
      return;
    }
    callback(new Error('Somente arquivos PDF são aceitos'));
  },
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não permitida'));
  },
}));
app.use(express.json({ limit: '100kb' }));

// ---------- Swagger UI ----------
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MEU PDF API',
      version: '1.0.0',
      description:
        'API em TypeScript (Express) para edição de PDFs. Extrai textos com coordenadas e grava alterações no PDF.',
    },
    servers: [{ url: 'http://127.0.0.1:8000' }],
    tags: [{ name: 'PDF', description: 'Operações de edição de PDF' }],
  },
  apis: [path.join(__dirname, 'api-master.{js,ts}')],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------- Autenticação (SQLite) ----------
const SESSION_DAYS = 30;
const SESSION_DAYS_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const AUTH_DIR = path.resolve(process.cwd(), '.data');
fs.mkdirSync(AUTH_DIR, { recursive: true });

const db = new Database(path.join(AUTH_DIR, 'pdfmaster.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    criado_em INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expira_em INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessoes_email ON sessoes(email);
`);

interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  hash: string;
  salt: string;
  criado_em: number;
}

interface LinhaSessao {
  token: string;
  email: string;
  expira_em: number;
}

function gerarHash(senha: string, salt: string): string {
  return crypto.pbkdf2Sync(senha, salt, 100_000, 64, 'sha256').toString('hex');
}

function gerarToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function emailValido(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function inserirSessao(email: string): string {
  const token = gerarToken();
  db.prepare('INSERT INTO sessoes (token, email, expira_em) VALUES (?, ?, ?)').run(
    token,
    email,
    Date.now() + SESSION_DAYS_MS,
  );
  return token;
}

function limparSessoesExpiradas(): void {
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
}

/** Retorna o usuário por um token de sessão válido, ou null. */
function usuarioPorToken(token: string): LinhaUsuario | null {
  const sessao = db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token) as LinhaSessao | undefined;
  if (!sessao) return null;
  if (sessao.expira_em < Date.now()) {
    db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    return null;
  }
  return (db.prepare('SELECT * FROM usuarios WHERE email = ?').get(sessao.email) as LinhaUsuario | undefined) ?? null;
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Cria um novo usuário
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               email: { type: string }
 *               senha: { type: string }
 *             required: [nome, email, senha]
 *     responses:
 *       201:
 *         description: Usuário criado com token
 *       400:
 *         description: Dados inválidos ou e-mail já cadastrado
 */
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { nome, email, senha } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof nome !== 'string' || nome.trim().length < 2 || nome.length > 80) {
    return res.status(400).json({ error: 'Nome deve ter entre 2 e 80 caracteres' });
  }
  if (!emailValido(email)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }
  if (typeof senha !== 'string' || senha.length < 6 || senha.length > 128) {
    return res.status(400).json({ error: 'A senha deve ter entre 6 e 128 caracteres' });
  }

  const emailNorm = email.toLowerCase();
  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailNorm);
  if (existente) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const usuario: LinhaUsuario = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    email: emailNorm,
    hash: gerarHash(senha, salt),
    salt,
    criado_em: Date.now(),
  };

  const token = db.transaction(() => {
    db.prepare(
      'INSERT INTO usuarios (id, nome, email, hash, salt, criado_em) VALUES (@id, @nome, @email, @hash, @salt, @criado_em)',
    ).run(usuario);
    return inserirSessao(usuario.email);
  })();

  return res.status(201).json({
    token,
    user: { id: usuario.id, nome: usuario.nome, email: usuario.email },
  });
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário e retorna um token
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               senha: { type: string }
 *             required: [email, senha]
 *     responses:
 *       200:
 *         description: Login realizado com token
 *       401:
 *         description: Credenciais inválidas
 */
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, senha } = (req.body ?? {}) as Record<string, unknown>;
  if (!emailValido(email) || typeof senha !== 'string' || !senha) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase()) as LinhaUsuario | undefined;
  if (!usuario) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }

  if (gerarHash(senha, usuario.salt) !== usuario.hash) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }

  const token = inserirSessao(usuario.email);
  return res.json({
    token,
    user: { id: usuario.id, nome: usuario.nome, email: usuario.email },
  });
});

function usuarioAutenticado(req: Request): LinhaUsuario | null {
  const header = req.headers['authorization'];
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  if (!match) return null;
  return usuarioPorToken(match[1].trim());
}

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retorna os dados do usuário autenticado
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário atual
 *       401:
 *         description: Token ausente ou inválido
 */
app.get('/api/auth/me', (req: Request, res: Response) => {
  const usuario = usuarioAutenticado(req);
  if (!usuario) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  return res.json({ user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerra a sessão atual
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessão encerrada
 */
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const header = req.headers['authorization'];
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  if (match) {
    db.prepare('DELETE FROM sessoes WHERE token = ?').run(match[1].trim());
  }
  return res.status(200).json({ ok: true });
});

// Mantém a tabela de sessões limpa de registros expirados durante a execução.
const LIMPEZA_MS = 60 * 60 * 1000;
setInterval(limparSessoesExpiradas, LIMPEZA_MS).unref();

interface Modificacao {
  tipo?: 'editar' | 'adicionar' | 'imagem';
  text: string;
  textoOriginal: string;
  htmlFormatado?: string;
  bbox?: number[];
  pageIndex?: number;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeThrough?: boolean;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  imagemData?: string;
}

function parseStrictInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isValidBbox(bbox: unknown): bbox is [number, number, number, number] {
  return Array.isArray(bbox)
    && bbox.length === 4
    && bbox.every((value) => typeof value === 'number' && Number.isFinite(value))
    && bbox[2] > bbox[0]
    && bbox[3] > bbox[1]
    && bbox[0] >= 0
    && bbox[1] >= 0;
}

function isValidHexColor(color: unknown): color is string {
  return typeof color !== 'string' || /^#[0-9a-fA-F]{6}$/.test(color);
}

function validateModifications(value: unknown, pageCount: number): value is Modificacao[] {
  if (!Array.isArray(value)) return false;

  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const modification = item as Record<string, unknown>;
    if (modification['tipo'] !== undefined && !['editar', 'adicionar', 'imagem'].includes(String(modification['tipo']))) return false;
    if (typeof modification['text'] !== 'string' || typeof modification['textoOriginal'] !== 'string') return false;
    if (modification['text'].length > 10_000 || modification['textoOriginal'].length > 10_000) return false;
    if (modification['tipo'] !== 'adicionar' && modification['tipo'] !== 'imagem' && !modification['textoOriginal'].trim()) return false;

    if (modification['pageIndex'] !== undefined
      && (typeof modification['pageIndex'] !== 'number'
        || !Number.isInteger(modification['pageIndex'])
        || modification['pageIndex'] < 0
        || modification['pageIndex'] >= pageCount)) {
      return false;
    }

    if (modification['tipo'] === 'adicionar'
      && (modification['pageIndex'] === undefined || modification['bbox'] === undefined)) return false;
    if (modification['tipo'] === 'imagem') {
      if (modification['pageIndex'] === undefined || modification['bbox'] === undefined) return false;
      if (typeof modification['imagemData'] !== 'string' || modification['imagemData'].length > 12 * 1024 * 1024) return false;
      if (!/^data:image\/(png|jpeg|jpg);base64,[a-z0-9+/=]+$/i.test(modification['imagemData'])) return false;
    }

    if (modification['bbox'] !== undefined && !isValidBbox(modification['bbox'])) return false;
    if (modification['fontFamily'] !== undefined && typeof modification['fontFamily'] !== 'string') return false;
    if (modification['fontSize'] !== undefined
      && (typeof modification['fontSize'] !== 'number'
        || !Number.isFinite(modification['fontSize'])
        || modification['fontSize'] < 1
        || modification['fontSize'] > 144)) return false;
    if (['bold', 'italic', 'underline', 'strikeThrough'].some((key) =>
      modification[key] !== undefined && typeof modification[key] !== 'boolean')) return false;
    if (!isValidHexColor(modification['color'])) return false;
    if (modification['textAlign'] !== undefined
      && !['left', 'center', 'right'].includes(String(modification['textAlign']))) return false;
    if (modification['verticalAlign'] !== undefined
      && !['top', 'middle', 'bottom'].includes(String(modification['verticalAlign']))) return false;
    return true;
  });
}

interface AlvoTexto {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Span {
  text: string;
  bbox: number[];
}

async function localizarAlvoPorBbox(pdf: any, pageIndex: number, bbox: number[]): Promise<AlvoTexto[]> {
  if (!isValidBbox(bbox) || pageIndex < 0 || pageIndex >= pdf.numPages) return [];
  const page = await pdf.getPage(pageIndex + 1);
  const { width, height } = page.getViewport({ scale: 1 });
  if (bbox[2] > width || bbox[3] > height) return [];
  return [{
    pageIndex,
    x: bbox[0],
    y: bbox[1],
    width: bbox[2] - bbox[0],
    height: bbox[3] - bbox[1],
  }];
}

// Converte as coordenadas do pdf.js (origem inferior esquerda)
// para o mesmo formato do PyMuPDF (origem no canto superior esquerdo),
// que é o que o frontend espera para desenhar as caixas de edição.
// Observação: width e height já vêm em pontos de página (unidades PDF),
// por isso NÃO são multiplicados pela escala do transform.
function calcularBbox(item: any, pageHeight: number): { x: number; y: number; width: number; height: number } {
  const t = item?.transform ?? [1, 0, 0, 1, 0, 0];
  const x = t[4] ?? 0;
  const yPdf = t[5] ?? 0;
  const width = item?.width ?? 0;
  const height = item?.height ?? 0;
  const y = pageHeight - (yPdf + height);
  return { x, y, width, height };
}

/**
 * @swagger
 * /extrair-textos:
 *   post:
 *     summary: Extrai os textos de uma página do PDF com suas coordenadas
 *     description: Envia o arquivo PDF e o índice da página; a API devolve os trechos de texto com o bbox em pontos PDF (origem no canto superior esquerdo).
 *     tags: [PDF]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo PDF a ser analisado
 *               page:
 *                 type: integer
 *                 description: Índice da página (0 = primeira)
 *             required:
 *               - file
 *               - page
 *     responses:
 *       200:
 *         description: Lista de spans de texto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spans:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                       bbox:
 *                         type: array
 *                         items:
 *                           type: number
 *                         description: '[x0, y0, x1, y1]'
 *       400:
 *         description: Arquivo ou página inválidos
 *       500:
 *         description: Erro interno ao extrair o texto
 */
app.post('/extrair-textos', upload.single('file'), async (req: Request, res: Response) => {
  let pdf: any;
  try {
    if (!req.file || !isPdf(req.file.buffer)) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const pageNum = parseStrictInteger(req.body.page);
    if (pageNum === null) {
      return res.status(400).json({ error: 'Número da página inválido' });
    }

    try {
      pdf = await getDocument({ data: new Uint8Array(req.file.buffer) }).promise;
    } catch {
      return res.status(400).json({ error: 'O arquivo enviado não é um PDF válido' });
    }

    if (pageNum >= pdf.numPages) {
      return res.status(400).json({ error: 'Número da página fora do intervalo do PDF' });
    }

    const page = await pdf.getPage(pageNum + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const textContent = await page.getTextContent();

    const spans: Span[] = [];
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str || !item.str.trim()) continue;
      const b = calcularBbox(item, pageHeight);
      spans.push({
        text: item.str,
        bbox: [b.x, b.y, b.x + b.width, b.y + b.height],
      });
    }

    return res.json({ spans });
  } catch (error) {
    console.error('Erro ao extrair texto:', error);
    return res.status(500).json({ error: 'Erro ao extrair texto do PDF' });
  } finally {
    await pdf?.cleanup?.();
    await pdf?.destroy?.();
  }
});

// Procura o texto original no PDF para descobrir a página e a posição exata.
// Se não encontrar (texto com formatação dividida em vários itens), usa o bbox enviado pelo front.
async function localizarTexto(
  pdf: any,
  texto: string,
  pageIndex?: number,
  bbox?: number[]
): Promise<AlvoTexto[]> {
  const alvos: AlvoTexto[] = [];
  const numPaginas = pdf.numPages;
  const paginasParaProcurar: number[] = [];

  if (pageIndex !== undefined && pageIndex >= 0 && pageIndex < numPaginas) {
    paginasParaProcurar.push(pageIndex);
  } else {
    for (let i = 0; i < numPaginas; i++) {
      paginasParaProcurar.push(i);
    }
  }

  for (const idx of paginasParaProcurar) {
    const page = await pdf.getPage(idx + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const textContent = await page.getTextContent();
    const items = (textContent.items || []).filter((i: any) => 'str' in i && i.str);

    let melhor: { item: any; score: number } | null = null;
    for (const item of items) {
      const str = item.str.trim();
      if (!str) continue;

      let score = -1;
      if (str === texto) score = 3;
      else if (str.startsWith(texto)) score = 2;
      else if (texto.startsWith(str)) score = 1;

      if (score >= 0 && (!melhor || score > melhor.score)) {
        melhor = { item, score };
      }
    }

    if (melhor) {
      const b = calcularBbox(melhor.item, pageHeight);
      alvos.push({ pageIndex: idx, x: b.x, y: b.y, width: b.width, height: b.height });
    }
  }

  // Fallback: usa a caixa enviada pelo front quando a busca falhou
  if (alvos.length === 0 && bbox && isValidBbox(bbox)) {
    const idx = pageIndex !== undefined && pageIndex >= 0 ? pageIndex : 0;
    if (idx < numPaginas) {
      const page = await pdf.getPage(idx + 1);
      const { width, height } = page.getViewport({ scale: 1 });
      if (bbox[2] <= width && bbox[3] <= height) {
        alvos.push({
          pageIndex: idx,
          x: bbox[0],
          y: bbox[1],
          width: bbox[2] - bbox[0],
          height: bbox[3] - bbox[1],
        });
      }
    }
  }

  return alvos;
}

function rgbFromHex(hex: string): [number, number, number] {
  const limpo = hex.replace('#', '');
  const r = parseInt(limpo.substring(0, 2), 16) / 255;
  const g = parseInt(limpo.substring(2, 4), 16) / 255;
  const b = parseInt(limpo.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function escolherStandardFont(fonte: string, bold: boolean, italic: boolean): StandardFonts {
  const base = (fonte || '').toLowerCase();

  if (base.includes('times') || base.includes('georgia')) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (base.includes('courier')) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

// Apaga o texto antigo cobrindo a região com um retângulo branco.
function apagarTexto(page: PDFPage, alvo: AlvoTexto): void {
  const { height: pageHeight } = page.getSize();
  const margem = 1;
  page.drawRectangle({
    x: alvo.x - margem,
    y: pageHeight - (alvo.y + alvo.height) - margem,
    width: alvo.width + margem * 2,
    height: alvo.height + margem * 2,
    color: rgb(1, 1, 1),
  });
}

// Escreve o novo texto na posição do texto original, aplicando formatação.
function escreverTextoFormatado(
  page: PDFPage,
  font: PDFFont,
  alvo: AlvoTexto,
  texto: string,
  fontSizeOverride: number | undefined,
  colorHex: string | undefined,
  underline: boolean,
  strikeThrough: boolean,
  textAlign: 'left' | 'center' | 'right',
  verticalAlign: 'top' | 'middle' | 'bottom',
): void {
  const { height: pageHeight } = page.getSize();
  const fontSize = fontSizeOverride && fontSizeOverride > 0
    ? Math.min(fontSizeOverride, 144)
    : Math.max(6, Math.round(alvo.height / 1.15));
  const [r, g, b] = colorHex ? rgbFromHex(colorHex) : [0, 0, 0];
  const areaWidth = Math.max(50, alvo.width + 2);
  const textWidth = font.widthOfTextAtSize(texto, fontSize);
  const xOffset = textAlign === 'center'
    ? Math.max(0, (areaWidth - textWidth) / 2)
    : textAlign === 'right'
      ? Math.max(0, areaWidth - textWidth)
      : 0;
  const x = alvo.x + 1 + xOffset;
  const baseline = verticalAlign === 'top'
    ? pageHeight - alvo.y - fontSize
    : verticalAlign === 'bottom'
      ? pageHeight - alvo.y - alvo.height + fontSize * 0.15
      : pageHeight - alvo.y - fontSize * 0.8;

  page.drawText(texto, {
    x,
    y: baseline,
    size: fontSize,
    font,
    color: rgb(r, g, b),
    maxWidth: areaWidth,
  });

  if (underline || strikeThrough) {
    const linhaY = underline ? baseline - fontSize * 0.12 : baseline + fontSize * 0.32;
    page.drawLine({
      start: { x, y: linhaY },
      end: { x: x + textWidth, y: linhaY },
      thickness: Math.max(0.5, fontSize * 0.06),
      color: rgb(r, g, b),
    });
  }
}

/**
 * @swagger
 * /salvar-pdf:
 *   post:
 *     summary: Aplica alterações de texto no PDF e retorna o arquivo editado
  *     description: Envia o PDF original e uma lista de modificações; a API localiza cada texto original, apaga com retângulo branco e escreve o texto com a formatação solicitada na mesma posição.
 *     tags: [PDF]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo PDF original
 *               modificacoes:
 *                 type: string
  *                 description: 'JSON array com alterações, inserções ou imagens: [{ tipo?: editar|adicionar|imagem, text, textoOriginal, pageIndex?, bbox?, fontFamily?, fontSize?, bold?, italic?, underline?, strikeThrough?, color?, textAlign?, verticalAlign?, imagemData? }]'
 *             required:
 *               - file
 *               - modificacoes
 *     responses:
 *       200:
 *         description: PDF editado (application/pdf)
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Arquivo ou JSON de modificações inválidos
 *       500:
 *         description: Erro interno ao salvar o PDF
 */
app.post('/salvar-pdf', upload.single('file'), async (req: Request, res: Response) => {
  let pdf: any;
  try {
    if (!req.file || !isPdf(req.file.buffer)) {
      return res.status(400).json({ error: 'Um arquivo PDF válido é obrigatório' });
    }

    if (typeof req.body.modificacoes !== 'string' || !req.body.modificacoes.trim()) {
      return res.status(400).json({ error: 'O campo modificacoes é obrigatório' });
    }

    let parsedModificacoes: unknown;
    try {
      parsedModificacoes = JSON.parse(req.body.modificacoes);
    } catch {
      return res.status(400).json({ error: 'O campo modificacoes deve conter um JSON válido' });
    }

    const bytes = new Uint8Array(req.file.buffer);

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(bytes);
    } catch {
      return res.status(400).json({ error: 'O arquivo enviado não é um PDF válido' });
    }
    const pages = pdfDoc.getPages();
    if (!validateModifications(parsedModificacoes, pages.length)) {
      return res.status(400).json({ error: 'Formato de modificacoes inválido' });
    }

    const modificacoes = parsedModificacoes;

    const cacheFontes = new Map<string, PDFFont>();
    const obterFonte = async (standardFont: StandardFonts): Promise<PDFFont> => {
      const chave = String(standardFont);
      if (!cacheFontes.has(chave)) {
        cacheFontes.set(chave, await pdfDoc.embedFont(standardFont));
      }
      return cacheFontes.get(chave)!;
    };

    try {
      pdf = await getDocument({ data: bytes }).promise;
    } catch {
      return res.status(400).json({ error: 'O arquivo enviado não pode ser lido' });
    }

    for (const mudanca of modificacoes) {
      const tipo = mudanca.tipo || 'editar';
      const textoOriginal = (mudanca.textoOriginal || '').trim();
      const textoNovo = (mudanca.text || '').trim();

      if (tipo === 'imagem') {
        const imagemMatch = mudanca.imagemData?.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
        if (!imagemMatch || mudanca.pageIndex === undefined || !mudanca.bbox) continue;
        const alvosImagem = await localizarAlvoPorBbox(pdf, mudanca.pageIndex, mudanca.bbox);
        const imagemBytes = Buffer.from(imagemMatch[2], 'base64');
        const imagemPdf = imagemMatch[1].toLowerCase() === 'png'
          ? await pdfDoc.embedPng(imagemBytes)
          : await pdfDoc.embedJpg(imagemBytes);

        for (const alvo of alvosImagem) {
          const page = pages[alvo.pageIndex];
          if (!page) continue;
          const { height: pageHeight } = page.getSize();
          page.drawImage(imagemPdf, {
            x: alvo.x,
            y: pageHeight - alvo.y - alvo.height,
            width: alvo.width,
            height: alvo.height,
          });
        }
        continue;
      }

      if (!textoOriginal || !textoNovo) {
        if (tipo !== 'adicionar' || !textoNovo) continue;
      }

      const mudouApenasFormatacao = textoOriginal === textoNovo && (
        mudanca.fontFamily !== undefined
        || mudanca.fontSize !== undefined
        || mudanca.bold !== undefined
        || mudanca.italic !== undefined
        || mudanca.underline !== undefined
        || mudanca.strikeThrough !== undefined
        || mudanca.color !== undefined
        || mudanca.textAlign !== undefined
        || mudanca.verticalAlign !== undefined
      );
      if (tipo === 'editar' && textoOriginal === textoNovo && !mudouApenasFormatacao) continue;

      const alvos = tipo === 'adicionar'
        ? await localizarAlvoPorBbox(pdf, mudanca.pageIndex!, mudanca.bbox!)
        : await localizarTexto(pdf, textoOriginal, mudanca.pageIndex, mudanca.bbox);
      const standardFont = escolherStandardFont(
        mudanca.fontFamily || 'Helvetica',
        !!mudanca.bold,
        !!mudanca.italic,
      );
      const font = await obterFonte(standardFont);

      for (const alvo of alvos) {
        const page = pages[alvo.pageIndex];
        if (!page) continue;
        if (tipo !== 'adicionar') apagarTexto(page, alvo);
        escreverTextoFormatado(
          page,
          font,
          alvo,
          textoNovo,
          mudanca.fontSize,
          mudanca.color,
          !!mudanca.underline,
          !!mudanca.strikeThrough,
          mudanca.textAlign || 'left',
          mudanca.verticalAlign || 'middle',
        );
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pdf_editado_master.pdf');
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Erro ao salvar PDF:', error);
    return res.status(500).json({ error: 'Erro ao salvar PDF modificado' });
  } finally {
    await pdf?.cleanup?.();
    await pdf?.destroy?.();
  }
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'O arquivo PDF excede o limite de 25 MB' });
      return;
    }
    res.status(400).json({ error: 'Upload multipart inválido' });
    return;
  }

  if (error instanceof Error && error.message === 'Origem não permitida') {
    res.status(403).json({ error: 'Origem não permitida' });
    return;
  }

  if (error instanceof Error && error.message === 'Somente arquivos PDF são aceitos') {
    res.status(400).json({ error: error.message });
    return;
  }

  console.error('Erro não tratado na API:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env['PORT'] || 8000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}
