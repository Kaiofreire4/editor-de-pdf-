import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Correção 1: Protocolo 'https:' explícito adicionado e tipagem 'any' para evitar erro do TS
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface Modificacao {
  textoOriginal: string;
  text: string;
  bbox?: number[]; // [x0, y0, x1, y1]
  pageIndex?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfManager {

  constructor() {}

  private async fileToBuffer(file: File): Promise<ArrayBuffer> {
    return await file.arrayBuffer();
  }

  async extrairTextos(file: File, pageNum: number) {
    const data = await this.fileToBuffer(file);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    if (pageNum >= pdf.numPages) return { spans: [] };

    const page = await pdf.getPage(pageNum + 1);
    const textContent = await page.getTextContent();

    // Correção 2: Validação de segurança para garantir que o 'transform' existe no item
    const spans = textContent.items.map((item: any) => {
      if (!item.transform) return null;

      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width;
      const height = item.height;

      return {
        text: item.str,
        bbox: [x, y, x + width, y + height]
      };
    }).filter(item => item !== null);

    return { spans: spans.filter((s: any) => s.text.trim() !== '') };
  }

  async salvarPdf(file: File, modificacoes: Modificacao[]): Promise<Blob> {
    const data = await this.fileToBuffer(file);
    const pdfDoc = await PDFDocument.load(data);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const mod of modificacoes) {
      if (!mod.textoOriginal || !mod.text || mod.textoOriginal.trim() === mod.text.trim()) {
        continue;
      }

      const pageIdx = mod.pageIndex ?? 0;
      const page = pages[pageIdx];

      if (page && mod.bbox) {
        const [x0, y0, x1, y1] = mod.bbox;

        page.drawRectangle({
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
          color: rgb(1, 1, 1),
        });

        page.drawText(mod.text, {
          x: x0,
          y: y0 + 2,
          size: 11,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }
}
