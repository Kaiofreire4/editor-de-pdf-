import { Component, ViewChildren, QueryList, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

interface PreviewJuntarItem {
  arquivo: string;
  indiceArquivo: number;
  pagina: number;
}

@Component({
  selector: 'app-organizar-pdf',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './organizar-pdf.html',
  styleUrl: './organizar-pdf.css'
})
export class OrganizarPdfComponent {
  @ViewChildren('previewJuntarCanvas') previewJuntarCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('previewCortarCanvas') previewCortarCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  // Estados para a ação de Juntar
  arquivosParaJuntar: File[] = [];

  // Estados para a ação de Cortar
  arquivoParaCortar: File | null = null;
  paginaDe: number = 1;
  paginaAte: number = 1;
  paginasEspecificas = '';

  mensagemStatus: string = 'Pronto';
  previewsJuntar: PreviewJuntarItem[] = [];
  documentosPreviewJuntar: any[] = [];
  totalPaginasCortar = 0;
  private pdfPreviewCortar: any = null;
  private cdr = inject(ChangeDetectorRef);

  get podeJuntar(): boolean {
    return this.arquivosParaJuntar.length >= 2;
  }

  get podeCortar(): boolean {
    return this.arquivoParaCortar !== null;
  }

  executar() {
    if (this.podeJuntar) {
      this.juntarPdfs();
    } else if (this.podeCortar) {
      this.cortarPdf();
    }
  }

  limpar() {
    this.arquivosParaJuntar = [];
    this.arquivoParaCortar = null;
    this.paginaDe = 1;
    this.paginaAte = 1;
    this.paginasEspecificas = '';
    this.previewsJuntar = [];
    this.documentosPreviewJuntar = [];
    this.pdfPreviewCortar = null;
    this.totalPaginasCortar = 0;
    this.mensagemStatus = 'Pronto';
  }

  // Detecta seleção de arquivos para JUNTAR
  onArquivosJuntarSelecionados(event: any) {
    if (event.target.files) {
      this.arquivosParaJuntar = Array.from(event.target.files);
      void this.prepararPreviewJuntar();
    }
  }

  // Lógica para JUNTAR os PDFs (Substitui o pypdf.PdfMerger)
  async juntarPdfs() {
    if (this.arquivosParaJuntar.length < 2) {
      alert('Selecione pelo menos 2 arquivos para juntar!');
      return;
    }

    try {
      const pdfDocsJuntos = await PDFDocument.create();

      for (const file of this.arquivosParaJuntar) {
        const fileArrayBuffer = await file.arrayBuffer();
        const pdfDoador = await PDFDocument.load(fileArrayBuffer);
        const paginasCopied = await pdfDocsJuntos.copyPages(pdfDoador, pdfDoador.getPageIndices());
        paginasCopied.forEach((page) => pdfDocsJuntos.addPage(page));
      }

      const pdfBytes = await pdfDocsJuntos.save();
      this.fazerDownload(pdfBytes, 'pdf_juntado_master.pdf');
      this.mensagemStatus = `${this.arquivosParaJuntar.length} PDFs juntados com sucesso.`;
      alert('✅ PDFs juntados com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao juntar os PDFs.');
    }
  }

  // Detecta seleção de arquivo para CORTAR
  onArquivoCortarSelecionado(event: any) {
    if (event.target.files && event.target.files[0]) {
      this.arquivoParaCortar = event.target.files[0];
      void this.prepararPreviewCortar();
    }
  }

  get paginasPreviewCortar(): number[] {
    if (!this.totalPaginasCortar) return [];
    const especificas = this.paginasEspecificas.trim();
    if (especificas) return this.interpretarPaginas(especificas);
    const inicio = Math.max(1, Math.min(this.paginaDe, this.totalPaginasCortar));
    const fim = Math.max(inicio, Math.min(this.paginaAte, this.totalPaginasCortar));
    return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
  }

  private interpretarPaginas(valor: string): number[] {
    const paginas = new Set<number>();
    for (const parte of valor.split(',')) {
      const intervalo = parte.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (intervalo) {
        const inicio = Number(intervalo[1]);
        const fim = Number(intervalo[2]);
        for (let pagina = Math.min(inicio, fim); pagina <= Math.max(inicio, fim); pagina++) {
          if (pagina >= 1 && pagina <= this.totalPaginasCortar) paginas.add(pagina);
        }
      } else if (/^\d+$/.test(parte.trim())) {
        const pagina = Number(parte.trim());
        if (pagina >= 1 && pagina <= this.totalPaginasCortar) paginas.add(pagina);
      }
    }
    return [...paginas].sort((a, b) => a - b);
  }

  onIntervaloAlterado() {
    if (this.totalPaginasCortar) {
      this.cdr.detectChanges();
      setTimeout(() => this.renderizarPreviewCortar());
    }
  }

  onPaginasEspecificasAlteradas(): void {
    if (this.totalPaginasCortar) {
      this.cdr.detectChanges();
      setTimeout(() => this.renderizarPreviewCortar());
    }
  }

  private configurarPdfJs() {
    const versao = pdfjsLib.version;
    const extensao = versao.startsWith('4') ? 'mjs' : 'js';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versao}/pdf.worker.min.${extensao}`;
  }

  private async prepararPreviewJuntar() {
    try {
      this.configurarPdfJs();
      this.documentosPreviewJuntar = [];
      this.previewsJuntar = [];
      for (let indiceArquivo = 0; indiceArquivo < this.arquivosParaJuntar.length; indiceArquivo++) {
        const arquivo = this.arquivosParaJuntar[indiceArquivo];
        const documento = await pdfjsLib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
        this.documentosPreviewJuntar.push(documento);
        for (let pagina = 1; pagina <= documento.numPages; pagina++) {
          this.previewsJuntar.push({ arquivo: arquivo.name, indiceArquivo, pagina });
        }
      }
      this.cdr.detectChanges();
      setTimeout(() => this.renderizarPreviewJuntar());
    } catch (error) {
      console.error('Erro ao gerar prévia dos PDFs:', error);
      this.previewsJuntar = [];
    }
  }

  private async renderizarPreviewJuntar() {
    const canvases = this.previewJuntarCanvases?.toArray() || [];
    for (let index = 0; index < canvases.length; index++) {
      const item = this.previewsJuntar[index];
      const page = await this.documentosPreviewJuntar[item.indiceArquivo].getPage(item.pagina);
      await this.renderizarPaginaPreview(page, canvases[index].nativeElement);
    }
  }

  private async prepararPreviewCortar() {
    try {
      this.configurarPdfJs();
      this.pdfPreviewCortar = await pdfjsLib.getDocument({ data: new Uint8Array(await this.arquivoParaCortar!.arrayBuffer()) }).promise;
      this.totalPaginasCortar = this.pdfPreviewCortar.numPages;
      this.paginaDe = 1;
      this.paginaAte = this.totalPaginasCortar;
      this.cdr.detectChanges();
      setTimeout(() => this.renderizarPreviewCortar());
    } catch (error) {
      console.error('Erro ao gerar prévia do PDF:', error);
      this.pdfPreviewCortar = null;
      this.totalPaginasCortar = 0;
    }
  }

  private async renderizarPreviewCortar() {
    if (!this.pdfPreviewCortar) return;
    const canvases = this.previewCortarCanvases?.toArray() || [];
    const paginas = this.paginasPreviewCortar;
    for (let index = 0; index < canvases.length; index++) {
      const page = await this.pdfPreviewCortar.getPage(paginas[index]);
      await this.renderizarPaginaPreview(page, canvases[index].nativeElement);
    }
  }

  private async renderizarPaginaPreview(page: any, canvas: HTMLCanvasElement) {
    const originalViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(150 / originalViewport.width, 190 / originalViewport.height) });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (context) await page.render({ canvasContext: context, viewport }).promise;
  }

  // Lógica para CORTAR o PDF (Substitui o pypdf.PdfWriter)
  async cortarPdf() {
    if (!this.arquivoParaCortar) {
      alert('Por favor, selecione um PDF para recortar!');
      return;
    }

    try {
      const fileArrayBuffer = await this.arquivoParaCortar.arrayBuffer();
      const pdfOriginal = await PDFDocument.load(fileArrayBuffer);
      const totalPaginas = pdfOriginal.getPageCount();

      const paginasSelecionadas = this.paginasEspecificas.trim()
        ? this.interpretarPaginas(this.paginasEspecificas)
        : this.paginasPreviewCortar;
      if (paginasSelecionadas.length === 0 || paginasSelecionadas.some((pagina) => pagina < 1 || pagina > totalPaginas)) {
        alert(`Insira páginas válidas! O PDF possui ${totalPaginas} páginas.`);
        return;
      }

      const novoPdf = await PDFDocument.create();

      // Criando o array de índices (ex: de 1 até 3 vira os índices 0, 1, 2)
      const indicesParaCopiar = paginasSelecionadas.map((pagina) => pagina - 1);

      const paginasRecortadas = await novoPdf.copyPages(pdfOriginal, indicesParaCopiar);
      paginasRecortadas.forEach((page) => novoPdf.addPage(page));

      const pdfBytes = await novoPdf.save();
      this.fazerDownload(pdfBytes, 'pdf_recortado_master.pdf');
      this.mensagemStatus = `Páginas ${paginasSelecionadas.join(', ')} extraídas com sucesso.`;
      alert('✅ PDF cortado com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao cortar o PDF.');
    }
  }

 // Função auxiliar para disparar o download do arquivo pro usuário
  private fazerDownload(bytes: Uint8Array, nomeArquivo: string) {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    link.click();
  }
}
