import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

const pdfJsWorkerExtension = pdfjsLib.version.startsWith('4') ? 'mjs' : 'js';
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.${pdfJsWorkerExtension}`;

@Component({
  selector: 'app-visualizar-pdf',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visualizar-pdf.html',
  styleUrl: './visualizar-pdf.css',
})
export class VisualizarPdfComponent {
  @ViewChild('pdfCanvasVis') canvasRef!: ElementRef<HTMLCanvasElement>;

  pdfCarregado = false;
  docxCarregado = false;
  docxHtml = '';
  nomeArquivo = '';
  paginaAtual = 1;
  totalPaginas = 0;
  pdfDoc: any = null;
  escala = 1.5;

  get zoomPercent(): number {
    return Math.round(this.escala * 100);
  }

  get documentoCarregado(): boolean {
    return this.pdfCarregado || this.docxCarregado;
  }

  ajustarZoom(delta: number): void {
    const novaEscala = this.escala + delta;
    if (novaEscala < 0.5 || novaEscala > 3) return;
    this.escala = Math.round(novaEscala * 100) / 100;
    if (this.pdfCarregado) void this.renderizarPagina(this.paginaAtual);
  }

  imprimir(): void {
    if (!this.documentoCarregado) return;
    const janela = window.open('', '_blank');
    if (!janela) return;

    if (this.docxCarregado) {
      janela.document.write(`<html><head><title>Imprimir DOCX</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.5}img{max-width:100%}</style></head><body>${this.docxHtml}<script>window.onload=function(){window.print();}<\/script></body></html>`);
      janela.document.close();
      return;
    }

    const dataUrl = this.canvasRef.nativeElement.toDataURL('image/png');
    janela.document.write(`<html><head><title>Imprimir PDF</title></head><body style="margin:0;text-align:center"><img src="${dataUrl}" style="max-width:100%"/><script>window.onload=function(){window.print();}<\/script></body></html>`);
    janela.document.close();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.pdfCarregado = false;
    this.docxCarregado = false;
    this.pdfDoc = null;
    this.docxHtml = '';
    this.nomeArquivo = file.name;

    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        const resultado = await (mammoth.convertToHtml as any)({ arrayBuffer: await file.arrayBuffer() }, {
          includeDefaultStyleMap: true,
          ignoreEmptyParagraphs: false,
        });
        this.docxHtml = resultado.value || '<p>Documento vazio.</p>';
        this.docxCarregado = true;
        return;
      }

      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Formato não suportado');
      const fileUrl = URL.createObjectURL(file);
      try {
        this.pdfDoc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
      } finally {
        URL.revokeObjectURL(fileUrl);
      }
      this.totalPaginas = this.pdfDoc.numPages;
      this.paginaAtual = 1;
      this.pdfCarregado = true;
      await this.renderizarPagina(this.paginaAtual);
    } catch (error: any) {
      console.error('Erro ao carregar documento:', error);
      this.pdfCarregado = false;
      this.docxCarregado = false;
      alert('Erro ao carregar o documento:\n' + (error?.message || error));
    }
  }

  async renderizarPagina(numPagina: number): Promise<void> {
    if (!this.pdfDoc) return;
    try {
      const page = await this.pdfDoc.getPage(numPagina);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;
      const viewport = page.getViewport({ scale: this.escala });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      console.error('Erro ao renderizar página no visualizador:', error);
    }
  }

  mudarPagina(delta: number): void {
    const novaPagina = this.paginaAtual + delta;
    if (novaPagina < 1 || novaPagina > this.totalPaginas) return;
    this.paginaAtual = novaPagina;
    void this.renderizarPagina(this.paginaAtual);
  }
}
