import express from 'express';
import type { Request, Response } from 'express';
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

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

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
  apis: [path.join(__dirname, 'api-master.js')],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

interface Modificacao {
  text: string;
  textoOriginal: string;
  htmlFormatado?: string;
  bbox?: number[];
  pageIndex?: number;
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
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const pageNum = parseInt(req.body.page, 10);
    if (isNaN(pageNum) || pageNum < 0) {
      return res.status(400).json({ error: 'Número da página inválido' });
    }

    const pdf = await getDocument({ data: new Uint8Array(req.file.buffer) }).promise;

    if (pageNum >= pdf.numPages) {
      return res.json({ spans: [] });
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
  if (alvos.length === 0 && bbox && bbox.length === 4) {
    const idx = pageIndex !== undefined && pageIndex >= 0 ? pageIndex : 0;
    alvos.push({
      pageIndex: idx,
      x: bbox[0],
      y: bbox[1],
      width: bbox[2] - bbox[0],
      height: bbox[3] - bbox[1],
    });
  }

  return alvos;
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

// Escreve o novo texto na posição do texto original.
function escreverTexto(page: PDFPage, font: PDFFont, alvo: AlvoTexto, texto: string): void {
  const { height: pageHeight } = page.getSize();
  // O item.height equivale à altura da linha; a fonte é ~87% disso.
  const fontSize = Math.max(6, Math.round(alvo.height / 1.15));
  // O pdf-lib usa a origem no canto inferior esquerdo; converte a linha de base
  // para centralizar verticalmente o novo texto dentro da caixa apagada.
  const baseline = pageHeight - alvo.y - fontSize * 0.8;
  page.drawText(texto, {
    x: alvo.x + 1,
    y: baseline,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
    maxWidth: Math.max(50, alvo.width + 2),
  });
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
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const modificacoes = JSON.parse(req.body.modificacoes || '[]') as Modificacao[];
    const bytes = new Uint8Array(req.file.buffer);

    const pdfDoc = await PDFDocument.load(bytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const pdf = await getDocument({ data: bytes }).promise;

    for (const mudanca of modificacoes) {
      const textoOriginal = (mudanca.textoOriginal || '').trim();
      const textoNovo = (mudanca.text || '').trim();

      if (!textoOriginal || !textoNovo || textoOriginal === textoNovo) {
        continue;
      }

      const alvos = await localizarTexto(pdf, textoOriginal, mudanca.pageIndex, mudanca.bbox);

      for (const alvo of alvos) {
        const page = pages[alvo.pageIndex];
        if (!page) continue;
        apagarTexto(page, alvo);
        escreverTexto(page, font, alvo, textoNovo);
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pdf_editado_master.pdf');
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Erro ao salvar PDF:', error);
    return res.status(500).json({ error: 'Erro ao salvar PDF modificado' });
  }
});

const PORT = process.env['PORT'] || 8000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
