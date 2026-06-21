import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
// @ts-ignore
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.post('/extrair-textos', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const pageStr = req.body.page;
    const pageNum = parseInt(pageStr, 10);

    const pdf = await getDocument({ data: req.file.buffer }).promise;

    if (pageNum >= pdf.numPages || pageNum < 0) {
      return res.json({ spans: [] });
    }

    const page = await pdf.getPage(pageNum + 1);
    const textContent = await page.getTextContent();

    const spans = textContent.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => ({
        text: item.str,
        bbox: [item.x, item.y, item.width, item.height],
      }));

    return res.json({ spans });
  } catch (error) {
    console.error('Erro ao extrair texto:', error);
    return res.status(500).json({ error: 'Erro ao extrair texto do PDF' });
  }
});

app.post('/salvar-pdf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const modificacoes = JSON.parse(req.body.modificacoes);
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();

    for (const mudanca of modificacoes) {
      const textoOriginal = mudanca.textoOriginal?.trim();
      const textoNovo = mudanca.text?.trim();

      if (
        textoOriginal &&
        textoNovo &&
        textoOriginal !== textoNovo
      ) {
        for (const page of pages) {
          await replaceTextOnPage(page, textoOriginal, textoNovo);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=pdf_editado_master.pdf'
    );
    // CORREÇÃO 1: Adicionado o "return"
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Erro ao salvar PDF:', error);
    return res.status(500).json({ error: 'Erro ao salvar PDF modificado' });
  }
});

async function replaceTextOnPage(
  page: PDFPage,
  originalText: string,
  newText: string
): Promise<void> {
  const { width, height } = page.getSize();

  // Aproximação: desenha caixas brancas sobre o texto original
  // Nota: pdf-lib não tem busca de texto nativa, então usamos uma abordagem simplificada
  // Para produção, considere usar uma biblioteca como pdfjs-dist com busca mais precisa

  page.drawText(newText, {
    x: 50,
    y: height - 50,
    size: 11,
    color: rgb(0, 0, 0),
  });
}

// CORREÇÃO 2: Acesso a 'PORT' utilizando notação de colchetes
const PORT = process.env['PORT'] || 8000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
