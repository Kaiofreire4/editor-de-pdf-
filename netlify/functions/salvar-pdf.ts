import type { Handler } from '@netlify/functions';
// @ts-ignore busboy does not ship types in this project.
import Busboy from 'busboy';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface Modification {
  tipo?: string;
  text?: string;
  bbox?: number[];
  pageIndex?: number;
  fontSize?: number;
  color?: string;
  imagemData?: string;
}

function resposta(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

function lerMultipart(event: Parameters<Handler>[0]): Promise<{ file: Buffer; modificacoes: Modification[] }> {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !event.body) return reject(new Error('Multipart ausente'));
    const busboy = Busboy({ headers: { 'content-type': contentType } });
    let file: Buffer | null = null;
    let modificacoes: Modification[] = [];
    busboy.on('file', (_name: string, stream: NodeJS.ReadableStream) => {
      const partes: Buffer[] = [];
      stream.on('data', (parte: Buffer) => partes.push(Buffer.from(parte)));
      stream.on('end', () => { file = Buffer.concat(partes); });
    });
    busboy.on('field', (name: string, value: string) => {
      if (name === 'modificacoes') modificacoes = JSON.parse(value) as Modification[];
    });
    busboy.on('finish', () => file ? resolve({ file, modificacoes }) : reject(new Error('Arquivo ausente')));
    busboy.on('error', reject);
    busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
  });
}

function validarBbox(bbox: number[] | undefined): bbox is [number, number, number, number] {
  return !!bbox && bbox.length === 4 && bbox.every(Number.isFinite) && bbox[2] > bbox[0] && bbox[3] > bbox[1] && bbox[0] >= 0 && bbox[1] >= 0;
}

function corDaModificacao(cor: string | undefined) {
  const match = /^#([0-9a-f]{6})$/i.exec(cor || '');
  if (!match) return rgb(0, 0, 0);
  const valor = Number.parseInt(match[1], 16);
  return rgb(((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255);
}

export const handler: Handler = async (event) => {
  try {
    const { file, modificacoes } = await lerMultipart(event);
    if (file.subarray(0, 5).toString('ascii') !== '%PDF-' || !Array.isArray(modificacoes)) return resposta(400, { error: 'Arquivo ou alterações inválidos' });
    const documento = await PDFDocument.load(file);
    const fonte = await documento.embedFont(StandardFonts.Helvetica);
    const paginas = documento.getPages();

    for (const modificacao of modificacoes) {
      const pagina = paginas[modificacao.pageIndex ?? 0];
      if (!pagina || !validarBbox(modificacao.bbox)) continue;
      const [x0, y0, x1, y1] = modificacao.bbox;
      const alturaPagina = pagina.getHeight();
      if (x1 > pagina.getWidth() || y1 > alturaPagina) continue;

      if (modificacao.tipo === 'imagem' && modificacao.imagemData) {
        const imagem = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(modificacao.imagemData);
        if (!imagem) continue;
        const bytes = Buffer.from(imagem[2], 'base64');
        const incorporada = imagem[1].toLowerCase() === 'png' ? await documento.embedPng(bytes) : await documento.embedJpg(bytes);
        pagina.drawImage(incorporada, { x: x0, y: alturaPagina - y1, width: x1 - x0, height: y1 - y0 });
        continue;
      }

      const texto = (modificacao.text || '').trim();
      if (!texto) continue;
      pagina.drawRectangle({ x: x0, y: alturaPagina - y1, width: x1 - x0, height: y1 - y0, color: rgb(1, 1, 1) });
      pagina.drawText(texto, { x: x0, y: alturaPagina - y1 + 2, size: Math.min(144, Math.max(1, modificacao.fontSize || 11)), font: fonte, color: corDaModificacao(modificacao.color), maxWidth: x1 - x0 });
    }

    const bytes = await documento.save();
    return { statusCode: 200, isBase64Encoded: true, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename=pdf_editado_master.pdf' }, body: Buffer.from(bytes).toString('base64') };
  } catch (error) {
    console.error('Erro ao salvar PDF:', error);
    return resposta(500, { error: 'Erro ao salvar PDF modificado' });
  }
};
