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
      title: 'PdfMasterWeb API',
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

interface Modificacao {
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
  color?: string;
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

function validateModifications(value: unknown, pageCount: number): value is Modificacao[] {
  if (!Array.isArray(value)) return false;

  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const modification = item as Record<string, unknown>;
    if (typeof modification['text'] !== 'string' || typeof modification['textoOriginal'] !== 'string') return false;
    if (modification['text'].length > 10_000 || modification['textoOriginal'].length > 10_000) return false;

    if (modification['pageIndex'] !== undefined
      && (typeof modification['pageIndex'] !== 'number'
        || !Number.isInteger(modification['pageIndex'])
        || modification['pageIndex'] < 0
        || modification['pageIndex'] >= pageCount)) {
      return false;
    }

    return modification['bbox'] === undefined || isValidBbox(modification['bbox']);
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
): void {
  const { height: pageHeight } = page.getSize();
  const fontSize = fontSizeOverride && fontSizeOverride > 0
    ? Math.min(fontSizeOverride, alvo.height * 1.6)
    : Math.max(6, Math.round(alvo.height / 1.15));
  const [r, g, b] = colorHex ? rgbFromHex(colorHex) : [0, 0, 0];
  const baseline = pageHeight - alvo.y - fontSize * 0.8;

  page.drawText(texto, {
    x: alvo.x + 1,
    y: baseline,
    size: fontSize,
    font,
    color: rgb(r, g, b),
    maxWidth: Math.max(50, alvo.width + 2),
  });

  if (underline) {
    const linhaY = pageHeight - alvo.y - fontSize * 0.92;
    page.drawLine({
      start: { x: alvo.x + 1, y: linhaY },
      end: { x: alvo.x + Math.max(50, alvo.width + 2), y: linhaY },
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
 *     description: Envia o PDF original e uma lista de modificações; a API localiza cada texto original, apaga com retângulo branco e escreve o novo texto na mesma posição.
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
 *                 description: 'JSON array com as alterações: [{ text, textoOriginal, pageIndex?, bbox? }]'
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
      const textoOriginal = (mudanca.textoOriginal || '').trim();
      const textoNovo = (mudanca.text || '').trim();

      if (!textoOriginal || !textoNovo || textoOriginal === textoNovo) {
        continue;
      }

      const alvos = await localizarTexto(pdf, textoOriginal, mudanca.pageIndex, mudanca.bbox);
      const standardFont = escolherStandardFont(
        mudanca.fontFamily || 'Helvetica',
        !!mudanca.bold,
        !!mudanca.italic,
      );
      const font = await obterFonte(standardFont);

      for (const alvo of alvos) {
        const page = pages[alvo.pageIndex];
        if (!page) continue;
        apagarTexto(page, alvo);
        escreverTextoFormatado(page, font, alvo, textoNovo, mudanca.fontSize, mudanca.color, !!mudanca.underline);
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
