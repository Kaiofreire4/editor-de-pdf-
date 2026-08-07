import { Component, ViewChild, ViewChildren, ElementRef, QueryList, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import { LocalPdfStorageService } from '../../services/local-pdf-storage';

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
  strikeThrough: boolean;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  novo?: boolean;
}

interface ImagemItem {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bbox: [number, number, number, number];
  novo: boolean;
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

@Component({
  selector: 'app-editar-texto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editar-texto.html',
  styleUrl: './editar-texto.css'
})
export class EditarTextoComponent {
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('thumbnailCanvas') thumbnailCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  arquivoSelecionado: File | null = null;
  pdfCarregado: boolean = false;
  mostrarEstadoVazio: boolean = true;
  paginaAtual: number = 1;
  totalPaginas: number = 0;
  pdfDoc: any = null;
  escala: number = 1.5;

  spansDaPagina: SpanItem[] = [];
  private spansPorPagina = new Map<number, SpanItem[]>();
  imagensDaPagina: ImagemItem[] = [];
  private imagensPorPagina = new Map<number, ImagemItem[]>();
  spanAtivoId: string | null = null;
  imagemAtivaId: string | null = null;
  manterProporcaoImagem = true;
  manterProporcaoTexto = false;
  modoAdicionarTexto = false;
  modoAdicionarImagem = false;
  imagemPendente: string | null = null;
  miniaturasAbertas = true;

  private cdr = inject(ChangeDetectorRef);
  private localPdfStorage = inject(LocalPdfStorageService);
  private sequenciaId = 0;
  private resizeState: {
    span: SpanItem;
    handle: HandlePosition;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null = null;
  private imageResizeState: {
    imagem: ImagemItem;
    handle: HandlePosition;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null = null;

  readonly fontesDisponiveis = [
    'Arial',
    'Comic Sans MS',
    'Calibri',
    'Cambria',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Roboto',
    'Open Sans',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
    'Helvetica',
    'Arial Black',
    'Impact',
  ];
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

  get imagemAtiva(): ImagemItem | undefined {
    return this.imagensDaPagina.find((imagem) => imagem.id === this.imagemAtivaId);
  }

  get spansModificadosCount(): number {
    let count = 0;
    this.spansPorPagina.forEach((spans) => {
      count += spans.filter((s) => s.modificado).length;
    });
    return count;
  }

  get paginas(): number[] {
    return Array.from({ length: this.totalPaginas }, (_, index) => index + 1);
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
    this.imagemAtivaId = null;
    this.spansPorPagina.clear();
    this.imagensPorPagina.clear();
    this.spansDaPagina = [];
    this.imagensDaPagina = [];
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
      this.cdr.detectChanges();
      setTimeout(() => this.renderizarMiniaturas());
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
      this.imagensDaPagina = this.imagensPorPagina.get(paginaIndex) || [];
      this.reposicionarSpansDaPagina();
      this.spanAtivoId = null;
      this.imagemAtivaId = null;
      await this.renderizarApenasCanvas(numPagina);
      this.cdr.detectChanges();
      return;
    }

    this.imagensDaPagina = this.imagensPorPagina.get(paginaIndex) || [];
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
    this.reposicionarSpansDaPagina();
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
          strikeThrough: false,
          color: '#000000',
          textAlign: 'left',
          verticalAlign: 'middle',
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
    this.modoAdicionarTexto = false;
    this.modoAdicionarImagem = false;
    this.imagemAtivaId = null;
    this.spanAtivoId = id;
    this.cdr.detectChanges();
  }

  ativarModoAdicionarTexto() {
    if (!this.pdfDoc || !this.canvasRef?.nativeElement?.width) return;
    this.modoAdicionarTexto = !this.modoAdicionarTexto;
    this.modoAdicionarImagem = false;
    this.spanAtivoId = null;
    this.imagemAtivaId = null;
    this.cdr.detectChanges();
  }

  ativarModoEditarTexto() {
    this.modoAdicionarTexto = false;
    this.modoAdicionarImagem = false;
    this.imagemAtivaId = null;
    this.cdr.detectChanges();
  }

  alternarMiniaturas() {
    this.miniaturasAbertas = !this.miniaturasAbertas;
    if (this.miniaturasAbertas) setTimeout(() => this.renderizarMiniaturas());
  }

  irParaPagina(numero: number) {
    if (numero === this.paginaAtual) return;
    const delta = numero - this.paginaAtual;
    this.mudarPagina(delta);
  }

  private async renderizarMiniaturas() {
    if (!this.pdfDoc || !this.miniaturasAbertas || !this.thumbnailCanvases) return;
    const canvases = this.thumbnailCanvases.toArray();

    for (let index = 0; index < canvases.length; index++) {
      const page = await this.pdfDoc.getPage(index + 1);
      const originalViewport = page.getViewport({ scale: 1 });
      const escalaMiniatura = Math.min(170 / originalViewport.width, 225 / originalViewport.height);
      const viewport = page.getViewport({ scale: escalaMiniatura });
      const canvas = canvases[index].nativeElement;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (context) await page.render({ canvasContext: context, viewport }).promise;
    }
  }

  adicionarTextoNoPonto(event: MouseEvent) {
    if (!this.modoAdicionarTexto || !this.pdfDoc) return;

    const target = event.target as HTMLElement;
    if (target.closest('.format-toolbar')) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    this.removerTextoNovoVazio();

    const largura = Math.min(260, Math.max(160, rect.width - x - 12));
    const altura = 30;
    const id = `span-${++this.sequenciaId}`;
    const span: SpanItem = {
      id,
      text: '',
      textoOriginal: '',
      x,
      y,
      w: largura,
      h: altura,
      bbox: [x / this.escala, y / this.escala, (x + largura) / this.escala, (y + altura) / this.escala],
      modificado: true,
      fontFamily: 'Arial',
      fontSize: 12,
      bold: false,
      italic: false,
      underline: false,
      strikeThrough: false,
      color: '#000000',
      textAlign: 'left',
      verticalAlign: 'middle',
      novo: true,
    };

    this.spansDaPagina = [...this.spansDaPagina, span];
    this.spansPorPagina.set(this.paginaAtual - 1, this.spansDaPagina);
    this.spanAtivoId = id;
    event.stopPropagation();
    this.cdr.detectChanges();
    setTimeout(() => (document.querySelector('.inline-text-input') as HTMLInputElement | null)?.focus());
  }

  onImagemSelecionada(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.imagemPendente = typeof reader.result === 'string' ? reader.result : null;
      this.modoAdicionarImagem = this.imagemPendente !== null;
      this.modoAdicionarTexto = false;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  adicionarImagemNoPonto(event: MouseEvent) {
    if (!this.modoAdicionarImagem || !this.imagemPendente || !this.pdfDoc) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    const largura = Math.min(240, rect.width - x - 12);
    const altura = largura * 0.65;
    const imagem: ImagemItem = {
      id: `imagem-${++this.sequenciaId}`,
      dataUrl: this.imagemPendente,
      x,
      y,
      w: largura,
      h: altura,
      bbox: [x / this.escala, y / this.escala, (x + largura) / this.escala, (y + altura) / this.escala],
      novo: true,
    };

    this.imagensDaPagina = [...this.imagensDaPagina, imagem];
    this.imagensPorPagina.set(this.paginaAtual - 1, this.imagensDaPagina);
    this.modoAdicionarImagem = false;
    this.imagemPendente = null;
    this.imagemAtivaId = imagem.id;
    this.spanAtivoId = null;
    event.stopPropagation();
    this.cdr.detectChanges();
  }

  interagirComPagina(event: MouseEvent) {
    if (this.modoAdicionarImagem) {
      this.adicionarImagemNoPonto(event);
      return;
    }
    this.adicionarTextoNoPonto(event);
  }

  selecionarImagem(imagem: ImagemItem, event: MouseEvent) {
    this.imagemAtivaId = imagem.id;
    this.spanAtivoId = null;
    this.modoAdicionarImagem = false;
    event.stopPropagation();
    this.cdr.detectChanges();
  }

  alterarTamanhoImagem(dimensao: 'w' | 'h', valor: number) {
    const imagem = this.imagemAtiva;
    if (!imagem || !Number.isFinite(valor) || valor < 10) return;
    const proporcao = imagem.w / imagem.h;
    if (dimensao === 'w') {
      imagem.w = valor;
      if (this.manterProporcaoImagem) imagem.h = valor / proporcao;
    } else {
      imagem.h = valor;
      if (this.manterProporcaoImagem) imagem.w = valor * proporcao;
    }
    this.atualizarBboxImagem(imagem);
  }

  removerImagemAtiva() {
    if (!this.imagemAtivaId) return;
    this.imagensDaPagina = this.imagensDaPagina.filter((imagem) => imagem.id !== this.imagemAtivaId);
    this.imagensPorPagina.set(this.paginaAtual - 1, this.imagensDaPagina);
    this.imagemAtivaId = null;
    this.cdr.detectChanges();
  }

  private atualizarBboxImagem(imagem: ImagemItem) {
    imagem.bbox = [
      imagem.x / this.escala,
      imagem.y / this.escala,
      (imagem.x + imagem.w) / this.escala,
      (imagem.y + imagem.h) / this.escala,
    ];
    this.imagensPorPagina.set(this.paginaAtual - 1, this.imagensDaPagina);
    this.cdr.detectChanges();
  }

  selecionarOuAdicionarTexto(id: string, event: MouseEvent) {
    if (this.modoAdicionarImagem) {
      this.adicionarImagemNoPonto(event);
      return;
    }
    if (this.modoAdicionarTexto) {
      this.adicionarTextoNoPonto(event);
      return;
    }
    this.ativarSpan(id);
    event.stopPropagation();
  }

  deselecionarSpan(event?: MouseEvent) {
    if (event) {
      const target = event.target as HTMLElement;
      if (target.closest('.editable-text-block') || target.closest('.format-toolbar')) return;
    }
    this.removerTextoNovoVazio();
    this.spanAtivoId = null;
    this.imagemAtivaId = null;
    this.cdr.detectChanges();
  }

  private removerTextoNovoVazio() {
    const span = this.spanAtivo;
    if (!span?.novo || span.text.trim()) return;
    this.spansDaPagina = this.spansDaPagina.filter((item) => item.id !== span.id);
    this.spansPorPagina.set(this.paginaAtual - 1, this.spansDaPagina);
  }

  marcarModificado(span: SpanItem) {
    span.modificado = span.text !== span.textoOriginal;
  }

  iniciarRedimensionamentoSpan(event: PointerEvent, span: SpanItem, handle: HandlePosition) {
    event.preventDefault();
    event.stopPropagation();
    this.spanAtivoId = span.id;
    this.resizeState = {
      span,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: span.w,
      startHeight: span.h,
      startLeft: span.x,
      startTop: span.y,
    };
  }

  @HostListener('document:pointermove', ['$event'])
  redimensionarSpan(event: PointerEvent) {
    if (this.imageResizeState) {
      this.redimensionarImagemComAlca(event);
      return;
    }
    const state = this.resizeState;
    if (!state) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    let width = state.startWidth;
    let height = state.startHeight;
    let left = state.startLeft;
    let top = state.startTop;

    if (state.handle.includes('e')) width = state.startWidth + dx;
    if (state.handle.includes('w')) { width = state.startWidth - dx; left = state.startLeft + dx; }
    if (state.handle.includes('s')) height = state.startHeight + dy;
    if (state.handle.includes('n')) { height = state.startHeight - dy; top = state.startTop + dy; }

    if (width < 40) { width = 40; if (state.handle.includes('w')) left = state.startLeft + state.startWidth - width; }
    if (height < 18) { height = 18; if (state.handle.includes('n')) top = state.startTop + state.startHeight - height; }

    state.span.x = left;
    state.span.y = top;
    state.span.w = width;
    state.span.h = height;
    if (this.manterProporcaoTexto) {
      const proporcao = state.startWidth / state.startHeight;
      if (Math.abs(dx) >= Math.abs(dy)) state.span.h = state.span.w / proporcao;
      else state.span.w = state.span.h * proporcao;
    }
    state.span.w = Math.max(40, state.span.w);
    state.span.h = Math.max(18, state.span.h);
    state.span.bbox = [state.span.x / this.escala, state.span.y / this.escala, (state.span.x + state.span.w) / this.escala, (state.span.y + state.span.h) / this.escala];
    state.span.modificado = true;
    this.cdr.detectChanges();
  }

  @HostListener('document:pointerup')
  finalizarRedimensionamentoSpan() {
    if (this.resizeState) this.salvarEstadoDaPaginaAtual();
    if (this.imageResizeState && this.imagemAtiva) this.atualizarBboxImagem(this.imagemAtiva);
    this.resizeState = null;
    this.imageResizeState = null;
  }

  iniciarRedimensionamentoImagem(event: PointerEvent, imagem: ImagemItem, handle: HandlePosition) {
    event.preventDefault();
    event.stopPropagation();
    this.imagemAtivaId = imagem.id;
    this.imageResizeState = {
      imagem,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: imagem.w,
      startHeight: imagem.h,
      startLeft: imagem.x,
      startTop: imagem.y,
    };
  }

  private redimensionarImagemComAlca(event: PointerEvent) {
    const state = this.imageResizeState;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    let width = state.startWidth;
    let height = state.startHeight;
    let left = state.startLeft;
    let top = state.startTop;

    if (state.handle.includes('e')) width = state.startWidth + dx;
    if (state.handle.includes('w')) { width = state.startWidth - dx; left = state.startLeft + dx; }
    if (state.handle.includes('s')) height = state.startHeight + dy;
    if (state.handle.includes('n')) { height = state.startHeight - dy; top = state.startTop + dy; }

    if (this.manterProporcaoImagem) {
      const proporcao = state.startWidth / state.startHeight;
      if (Math.abs(dx) >= Math.abs(dy)) height = width / proporcao;
      else width = height * proporcao;
    }
    width = Math.max(30, width);
    height = Math.max(30, height);
    state.imagem.x = left;
    state.imagem.y = top;
    state.imagem.w = width;
    state.imagem.h = height;
    this.cdr.detectChanges();
  }

  private marcarModificadoPorFormatacao(span: SpanItem) {
    span.modificado = true;
  }

  alterarTamanhoTexto(dimensao: 'w' | 'h', valor: number) {
    const span = this.spanAtivo;
    if (!span || !Number.isFinite(valor) || valor < 20) return;
    const proporcao = span.w / span.h;
    if (dimensao === 'w') {
      span.w = valor;
      if (this.manterProporcaoTexto) span.h = valor / proporcao;
    } else {
      span.h = valor;
      if (this.manterProporcaoTexto) span.w = valor * proporcao;
    }
    span.bbox = [span.x / this.escala, span.y / this.escala, (span.x + span.w) / this.escala, (span.y + span.h) / this.escala];
    this.marcarModificadoPorFormatacao(span);
    this.cdr.detectChanges();
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

  alternarTachado() {
    const span = this.spanAtivo;
    if (span) { span.strikeThrough = !span.strikeThrough; this.marcarModificadoPorFormatacao(span); }
  }

  aplicarCor(cor: string) {
    const span = this.spanAtivo;
    if (span) { span.color = cor; this.marcarModificadoPorFormatacao(span); }
  }

  aplicarAlinhamento(alinhamento: 'left' | 'center' | 'right') {
    const span = this.spanAtivo;
    if (span) { span.textAlign = alinhamento; this.marcarModificadoPorFormatacao(span); }
  }

  aplicarAlinhamentoVertical(alinhamento: 'top' | 'middle' | 'bottom') {
    const span = this.spanAtivo;
    if (span) { span.verticalAlign = alinhamento; this.marcarModificadoPorFormatacao(span); }
  }

  limparFormatacao() {
    const span = this.spanAtivo;
    if (!span) return;
    span.fontFamily = 'Arial';
    span.fontSize = 12;
    span.bold = false;
    span.italic = false;
    span.underline = false;
    span.strikeThrough = false;
    span.color = '#000000';
    span.textAlign = 'left';
    span.verticalAlign = 'middle';
    this.marcarModificadoPorFormatacao(span);
  }

  getEstiloSpan(span: SpanItem, mostrarTexto = true): Record<string, string> {
    return {
      'font-family': span.fontFamily,
      'font-size': span.fontSize + 'px',
      'font-weight': span.bold ? 'bold' : 'normal',
      'font-style': span.italic ? 'italic' : 'normal',
      'text-decoration': [span.underline ? 'underline' : '', span.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
      'color': mostrarTexto ? span.color : 'transparent',
      'text-align': span.textAlign,
      'align-items': span.verticalAlign === 'top' ? 'flex-start' : span.verticalAlign === 'bottom' ? 'flex-end' : 'center',
      'justify-content': span.textAlign === 'center' ? 'center' : span.textAlign === 'right' ? 'flex-end' : 'flex-start',
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
            tipo: span.novo ? 'adicionar' : 'editar',
            text: span.text,
            textoOriginal: span.textoOriginal,
            pageIndex,
            bbox: [...span.bbox],
            fontFamily: span.fontFamily,
            fontSize: span.fontSize,
            bold: span.bold,
            italic: span.italic,
            underline: span.underline,
            strikeThrough: span.strikeThrough,
            color: span.color,
            textAlign: span.textAlign,
            verticalAlign: span.verticalAlign,
            novo: span.novo,
          })),
    );

    const imagensModificadas = Array.from(this.imagensPorPagina.entries()).flatMap(
      ([pageIndex, imagens]) => imagens.filter((imagem) => imagem.novo).map((imagem) => ({
        tipo: 'imagem',
        text: '',
        textoOriginal: '',
        pageIndex,
        bbox: [...imagem.bbox],
        imagemData: imagem.dataUrl,
      })),
    );
    const modificacoes = [...spansModificados, ...imagensModificadas];

    if (modificacoes.length === 0) {
      alert('Nenhuma alteração foi feita.');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.arquivoSelecionado);
    formData.append('modificacoes', JSON.stringify(modificacoes));

    try {
      const resposta = await fetch('http://127.0.0.1:8000/salvar-pdf', {
        method: 'POST',
        body: formData,
      });

      if (resposta.ok) {
        const blob = await resposta.blob();
        await this.localPdfStorage.savePdf(blob, 'pdf_editado_master.pdf');
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
      this.removerTextoNovoVazio();
      this.salvarEstadoDaPaginaAtual();
      this.paginaAtual = novaPagina;
      this.spanAtivoId = null;
      this.imagemAtivaId = null;
      this.carregarOuRenderizarPagina(this.paginaAtual);
    }
  }

  alterarZoom(delta: number) {
    const novaEscala = Math.min(2.5, Math.max(0.7, this.escala + delta));
    if (novaEscala === this.escala) return;
    this.escala = Number(novaEscala.toFixed(1));
    this.removerTextoNovoVazio();
    this.salvarEstadoDaPaginaAtual();
    this.spanAtivoId = null;
    this.carregarOuRenderizarPagina(this.paginaAtual);
  }

  private salvarEstadoDaPaginaAtual() {
    if (this.spansDaPagina.length > 0) {
      this.spansPorPagina.set(this.paginaAtual - 1, [...this.spansDaPagina]);
    }
    this.imagensPorPagina.set(this.paginaAtual - 1, [...this.imagensDaPagina]);
  }

  private reposicionarSpansDaPagina() {
    for (const span of this.spansDaPagina) {
      span.x = span.bbox[0] * this.escala;
      span.y = span.bbox[1] * this.escala;
      span.w = Math.max((span.bbox[2] - span.bbox[0]) * this.escala, 20);
      span.h = Math.max((span.bbox[3] - span.bbox[1]) * this.escala, 18);
    }
    for (const imagem of this.imagensDaPagina) {
      imagem.x = imagem.bbox[0] * this.escala;
      imagem.y = imagem.bbox[1] * this.escala;
      imagem.w = (imagem.bbox[2] - imagem.bbox[0]) * this.escala;
      imagem.h = (imagem.bbox[3] - imagem.bbox[1]) * this.escala;
    }
  }

  private limparCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }
}
