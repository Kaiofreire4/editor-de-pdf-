import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

@Component({
  selector: 'app-visualizar-pdf',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visualizar-pdf.html',
  styleUrl: './visualizar-pdf.css'
})
export class VisualizarPdfComponent {
  @ViewChild('pdfCanvasVis') canvasRef!: ElementRef<HTMLCanvasElement>;

  pdfCarregado: boolean = false;
  paginaAtual: number = 1;
  totalPaginas: number = 0;
  pdfDoc: any = null;
  escala: number = 1.5; // Mantém o mesmo zoom e nitidez do editor

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const fileUrl = URL.createObjectURL(file);
      this.pdfDoc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
      this.totalPaginas = this.pdfDoc.numPages;
      this.paginaAtual = 1;
      this.pdfCarregado = true;

      await this.renderizarPagina(this.paginaAtual);
    } catch (error: any) {
      console.error(error);
      alert('Erro ao carregar o visualizador de PDF:\n' + (error?.message || error));
    }
  }

  async renderizarPagina(numPagina: number) {
    if (!this.pdfDoc) return;

    try {
      // CORREÇÃO AQUI: Pega a página direto do documento carregado sem rodeios
      const page = await this.pdfDoc.getPage(numPagina);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');

      if (!context) return;

      // Calcula o tamanho correto usando a nossa escala (1.5)
      const viewport = page.getViewport({ scale: this.escala });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
    } catch (error) {
      console.error('Erro ao renderizar página no visualizador:', error);
    }
  }
  mudarPagina(delta: number) {
    const novaPagina = this.paginaAtual + delta;
    if (novaPagina >= 1 && novaPagina <= this.totalPaginas) {
      this.paginaAtual = novaPagina;
      this.renderizarPagina(this.paginaAtual);
    }
  }
}
