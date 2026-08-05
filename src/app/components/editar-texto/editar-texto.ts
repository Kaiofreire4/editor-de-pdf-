import { Component, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';

interface SpanItem {
  id: string;
  text: string;
  textoOriginal: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bbox: [number, number, number, number];
  modificado: boolean;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

@Component({
  selector: 'app-editar-texto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-texto.html',
  styleUrl: './editar-texto.css'
})
export class EditarTextoComponent {
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  arquivoSelecionado: File | null = null;
  pdfCarregado: boolean = false;
  mostrarEstadoVazio: boolean = true;
  paginaAtual: number = 1;
  totalPaginas: number = 0;
  pdfDoc: any = null;
  escala: number = 1.5;

  spansDaPagina: SpanItem[] = [];
  private spansPorPagina = new Map<number, SpanItem[]>();
  spanAtivoId: string | null = null;

  private cdr = inject(ChangeDetectorRef);
  private sequenciaId = 0;

  readonly fontesDisponiveis = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica'];
  readonly tamanhosDisponiveis = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
  readonly coresDisponiveis = [
    { nome: 'Preto', valor: '#000000' },
    { nome: 'Cinza', valor: '#555555' },
    { nome: 'Vermelho', valor: '#d32f2f' },
    { nome: 'Azul', valor: '#1565c0' },
    { nome: 'Verde', valor: '#2e7d32' },
  ];

  get zoomPercent(): number {
    return Math.round(this.escala * 100);
  }

  get pdfDisponivel(): boolean {
    return this.pdfCarregado && this.pdfDoc !== null;
  }

  get spanAtivo(): SpanItem | undefined {
    return this.spansDaPagina.find((s) => s.id === this.spanAtivoId);
  }

  get spansModificadosCount(): number {
    let count = 0;
    this.spansPorPagina.forEach((spans) => {
      count += spans.filter((s) => s.modificado).length;
    });
    return count;
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.arquivoSelecionado = file;
    this.pdfDoc = null;
    this.pdfCarregado = false;
    this.mostrarEstadoVazio = true;
    this.spanAtivoId = null;
    this.spansPorPagina.clear();
    this.spansDaPagina = [];
    this.sequenciaId = 0;
    this.limparCanvas();
    this.cdr.detectChanges();

    try {
      const versao = pdfjsLib.version;
      const extensao = versao.startsWith('4') ? 'mjs' : 'js';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versao}/pdf.worker.min.${extensao}`;

      const fileUrl = URL.createObjectURL(file);
      this.pdfDoc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
      this.totalPaginas = this.pdfDoc.numPages;
      this.paginaAtual = 1;
      this.pdfCarregado = true;
      this.mostrarEstadoVazio = false;
      this.cdr.detectChanges();

      await this.carregarOuRenderizarPagina(this.paginaAtual);
    } catch (error: any) {
      console.error('[PDF] ERRO ao carregar:', error?.message || error);
      this.pdfDoc = null;
      this.pdfCarregado = false;
      this.mostrarEstadoVazio = true;
      this.spansDaPagina = [];
      this.limparCanvas();
      this.cdr.detectChanges();
    }
  }

  private async carregarOuRenderizarPagina(numPagina: number) {
    if (!this.pdfDoc) return;

    const paginaIndex = numPagina - 1;

    if (this.spansPorPagina.has(paginaIndex)) {
      this.spansDaPagina = this.spansPorPagina.get(paginaIndex)!;
      this.spanAtivoId = null;
      await this.renderizarApenasCanvas(numPagina);
      this.cdr.detectChanges();
      return;
    }

    await this.renderizarPagina(numPagina);
  }

  private async renderizarApenasCanvas(numPagina: number) {
    const page = await this.pdfDoc.getPage(numPagina);
    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const viewport = page.getViewport({ scale: this.escala });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;
  }

  async renderizarPagina(numPagina: number) {
    if (!this.pdfDoc) return;

    try {
      this.salvarEstadoDaPaginaAtual();
      const page = await this.pdfDoc.getPage(numPagina);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: this.escala });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      this.extrairTextosLocalmente(page, viewport, numPagina);
    } catch (error) {
      console.error('Erro ao renderizar página:', error);
      this.spansDaPagina = [];
      this.spanAtivoId = null;
      this.cdr.detectChanges();
    }
  }

  private extrairTextosLocalmente(page: any, viewport: any, numPagina: number) {
    page.getTextContent().then((textContent: any) => {
      const alturaPagina = viewport.height;
      const spans: SpanItem[] = [];

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;

        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const fontSize = Math.abs(transform[0]) || 12;
        const fontFamily = item.fontName || 'Arial';
        const bold = !!(fontFamily.toLowerCase().includes('bold') || (item as any).bold);
        const italic = !!(fontFamily.toLowerCase().includes('italic') || fontFamily.toLowerCase().includes('oblique') || (item as any).italic);

        const x = (transform[4] || 0) * this.escala;
        const yPdf = (transform[5] || 0) * this.escala;
        const largura = (item.width || 0) * this.escala;
        const altura = fontSize * 1.4;

        const y = alturaPagina - yPdf - altura;
        if (largura <= 0 || altura <= 0) continue;

        const id = `span-${++this.sequenciaId}`;
        spans.push({
          id,
          text: item.str,
          textoOriginal: item.str,
          x,
          y,
          w: Math.max(largura + 4, 20),
          h: Math.max(altura + 2, 18),
          bbox: [x / this.escala, y / this.escala, (x + largura) / this.escala, (y + altura) / this.escala],
          modificado: false,
          fontFamily: this.mapearFonte(fontFamily),
          fontSize: Math.round(fontSize),
          bold,
          italic,
          underline: false,
          color: '#000000',
        });
      }

      this.spansDaPagina = this.filtrarSpansSemSobreposicao(spans);
      this.spansPorPagina.set(numPagina - 1, this.spansDaPagina);
      this.spanAtivoId = null;
      this.cdr.detectChanges();
    }).catch((err: any) => {
      console.warn('Extração de texto local falhou:', err);
    });
  }

  private mapearFonte(nome: string): string {
    const lower = nome.toLowerCase();
    if (lower.includes('times')) return 'Times New Roman';
    if (lower.includes('courier')) return 'Courier New';
    if (lower.includes('georgia')) return 'Georgia';
    if (lower.includes('verdana')) return 'Verdana';
    if (lower.includes('helvetica')) return 'Helvetica';
    return 'Arial';
  }

  private filtrarSpansSemSobreposicao(spans: SpanItem[]): SpanItem[] {
    if (spans.length === 0) return spans;
    const ordenados = [...spans].sort((a, b) => a.x - b.x || a.y - b.y);
    const resultado: SpanItem[] = [];
    let anterior: SpanItem | null = null;

    for (const span of ordenados) {
      if (anterior && span.x < anterior.x + anterior.w && Math.abs(span.y - anterior.y) < 4) {
        anterior.text += span.text;
        anterior.textoOriginal += span.textoOriginal;
        anterior.w = span.x + span.w - anterior.x;
        anterior.bbox[2] = anterior.bbox[0] + (anterior.w / this.escala);
      } else {
        resultado.push(span);
        anterior = span;
      }
    }
    return resultado;
  }

  ativarSpan(id: string) {
    this.spanAtivoId = id;
    this.cdr.detectChanges();
  }

  deselecionarSpan(event?: MouseEvent) {
    if (event) {
      const target = event.target as HTMLElement;
      if (target.closest('.editable-text-block') || target.closest('.format-toolbar')) return;
    }
    this.spanAtivoId = null;
    this.cdr.detectChanges();
  }

  marcarModificado(span: SpanItem) {
    span.modificado = span.text !== span.textoOriginal;
  }

  private marcarModificadoPorFormatacao(span: SpanItem) {
    span.modificado = true;
  }

  aplicarFonte(fonte: string) {
    const span = this.spanAtivo;
    if (span) { span.fontFamily = fonte; this.marcarModificadoPorFormatacao(span); }
  }

  aplicarTamanho(tamanho: number) {
    const span = this.spanAtivo;
    if (span) { span.fontSize = tamanho; this.marcarModificadoPorFormatacao(span); }
  }

  alternarNegrito() {
    const span = this.spanAtivo;
    if (span) { span.bold = !span.bold; this.marcarModificadoPorFormatacao(span); }
  }

  alternarItalico() {
    const span = this.spanAtivo;
    if (span) { span.italic = !span.italic; this.marcarModificadoPorFormatacao(span); }
  }

  alternarSublinhado() {
    const span = this.spanAtivo;
    if (span) { span.underline = !span.underline; this.marcarModificadoPorFormatacao(span); }
  }

  aplicarCor(cor: string) {
    const span = this.spanAtivo;
    if (span) { span.color = cor; this.marcarModificadoPorFormatacao(span); }
  }

  getEstiloSpan(span: SpanItem): Record<string, string> {
    return {
      'font-family': span.fontFamily,
      'font-size': span.fontSize + 'px',
      'font-weight': span.bold ? 'bold' : 'normal',
      'font-style': span.italic ? 'italic' : 'normal',
      'text-decoration': span.underline ? 'underline' : 'none',
      'color': span.color,
      'padding': '0 3px',
    };
  }

  async exportarPdf() {
    if (!this.arquivoSelecionado) return;

    this.salvarEstadoDaPaginaAtual();
    const spansModificados = Array.from(this.spansPorPagina.entries()).flatMap(
      ([pageIndex, spans]) =>
        spans
          .filter((span) => span.modificado)
          .map((span) => ({
            text: span.text,
            textoOriginal: span.textoOriginal,
            pageIndex,
            bbox: [...span.bbox],
            fontFamily: span.fontFamily,
            fontSize: span.fontSize,
            bold: span.bold,
            italic: span.italic,
            underline: span.underline,
            color: span.color,
          })),
    );

    if (spansModificados.length === 0) {
      alert('Nenhum texto foi alterado.');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.arquivoSelecionado);
    formData.append('modificacoes', JSON.stringify(spansModificados));

    try {
      const resposta = await fetch('http://127.0.0.1:8000/salvar-pdf', {
        method: 'POST',
        body: formData,
      });

      if (resposta.ok) {
        const blob = await resposta.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'pdf_editado_master.pdf';
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        const erro = await resposta.json().catch(() => null);
        alert(erro?.error || 'Erro ao processar o salvamento.');
      }
    } catch {
      alert('Erro ao conectar com o servidor. Verifique se a API está rodando na porta 8000.');
    }
  }

  mudarPagina(delta: number) {
    const novaPagina = this.paginaAtual + delta;
    if (novaPagina >= 1 && novaPagina <= this.totalPaginas) {
      this.salvarEstadoDaPaginaAtual();
      this.paginaAtual = novaPagina;
      this.spanAtivoId = null;
      this.carregarOuRenderizarPagina(this.paginaAtual);
    }
  }

  alterarZoom(delta: number) {
    const novaEscala = Math.min(2.5, Math.max(0.7, this.escala + delta));
    if (novaEscala === this.escala) return;
    this.escala = Number(novaEscala.toFixed(1));
    this.salvarEstadoDaPaginaAtual();
    this.spanAtivoId = null;
    this.carregarOuRenderizarPagina(this.paginaAtual);
  }

  private salvarEstadoDaPaginaAtual() {
    if (this.spansDaPagina.length > 0) {
      this.spansPorPagina.set(this.paginaAtual - 1, [...this.spansDaPagina]);
    }
  }

  private limparCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }
}
