import { ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
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
  private readonly cdr = inject(ChangeDetectorRef);

  pdfCarregado = false;
  docxCarregado = false;
  docxHtml = '';
  docxPaginas: string[] = [];
  nomeArquivo = '';
  paginaAtual = 1;
  totalPaginas = 0;
  pdfDoc: any = null;
  escala = 1.5;
  private toqueInicialY: number | null = null;
  private tentativasRenderizacao = 0;

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
    this.docxPaginas = [];
    this.nomeArquivo = file.name;

    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        const resultado = await (mammoth.convertToHtml as any)({ arrayBuffer: await file.arrayBuffer() }, {
          includeDefaultStyleMap: true,
          ignoreEmptyParagraphs: false,
        });
        this.docxHtml = resultado.value || '<p>Documento vazio.</p>';
        this.docxCarregado = true;
        this.cdr.detectChanges();
        await this.aguardarLayout();
        this.paginarDocx();
        this.totalPaginas = this.docxPaginas.length;
        this.paginaAtual = 1;
        this.cdr.detectChanges();
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
      this.cdr.detectChanges();
      await this.aguardarLayout();
      await this.renderizarPagina(this.paginaAtual);
      setTimeout(() => this.aplicarZoomAutomatico(), 180);
    } catch (error: any) {
      console.error('Erro ao carregar documento:', error);
      this.pdfCarregado = false;
      this.docxCarregado = false;
      alert('Erro ao carregar o documento:\n' + (error?.message || error));
    }
  }

  async renderizarPagina(numPagina: number): Promise<void> {
    if (!this.pdfDoc) return;
    if (!this.canvasRef?.nativeElement) {
      this.tentarRenderizarNovamente(numPagina);
      return;
    }
    try {
      const page = await this.pdfDoc.getPage(numPagina);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;
      const viewport = page.getViewport({ scale: this.escala });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;
      this.tentativasRenderizacao = 0;
    } catch (error) {
      console.error('Erro ao renderizar página no visualizador:', error);
      this.tentarRenderizarNovamente(numPagina);
    }
  }

  private aplicarZoomAutomatico(): void {
    if (!this.pdfCarregado) return;
    this.escala = Number(Math.min(3, this.escala + 0.01).toFixed(2));
    void this.renderizarPagina(this.paginaAtual);
  }

  private aguardarLayout(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  private paginarDocx(): void {
    const origem = document.createElement('div');
    origem.innerHTML = this.docxHtml;
    const medida = document.createElement('div');
    medida.style.cssText = 'position:fixed;left:-10000px;top:0;width:636px;height:948px;box-sizing:border-box;padding:0;overflow:hidden;visibility:hidden;font:15px/1.55 Calibri,Arial,sans-serif;';
    document.body.appendChild(medida);

    const paginas: string[] = [];
    let itensDaPagina: string[] = [];
    for (const filho of Array.from(origem.children)) {
      const html = filho.outerHTML;
      medida.innerHTML = [...itensDaPagina, html].join('');
      if (itensDaPagina.length > 0 && medida.scrollHeight > medida.clientHeight) {
        paginas.push(itensDaPagina.join(''));
        itensDaPagina = [html];
      } else {
        itensDaPagina.push(html);
      }
    }
    if (itensDaPagina.length > 0) paginas.push(itensDaPagina.join(''));
    document.body.removeChild(medida);
    this.docxPaginas = paginas.length > 0 ? paginas : ['<p>Documento vazio.</p>'];
  }

  private tentarRenderizarNovamente(numPagina: number): void {
    if (this.tentativasRenderizacao >= 5 || !this.pdfDoc || !this.pdfCarregado) return;
    this.tentativasRenderizacao += 1;
    setTimeout(() => void this.renderizarPagina(numPagina), 180 * this.tentativasRenderizacao);
  }

  mudarPagina(delta: number): void {
    const novaPagina = this.paginaAtual + delta;
    if (novaPagina < 1 || novaPagina > this.totalPaginas) return;
    this.paginaAtual = novaPagina;
    void this.renderizarPagina(this.paginaAtual);
  }

  iniciarToque(event: TouchEvent): void {
    this.toqueInicialY = event.changedTouches[0]?.clientY ?? null;
  }

  finalizarToque(event: TouchEvent): void {
    if (this.toqueInicialY === null) return;
    const toqueFinalY = event.changedTouches[0]?.clientY;
    if (toqueFinalY === undefined) return;
    const deslocamento = toqueFinalY - this.toqueInicialY;
    this.toqueInicialY = null;
    if (!Number.isFinite(deslocamento) || Math.abs(deslocamento) < 70) return;

    const area = event.currentTarget as HTMLElement;
    const chegouAoTopo = area.scrollTop <= 2;
    const chegouAoFim = area.scrollTop + area.clientHeight >= area.scrollHeight - 2;
    if (deslocamento < 0 && chegouAoFim) this.mudarPagina(1);
    if (deslocamento > 0 && chegouAoTopo) this.mudarPagina(-1);
  }
}
