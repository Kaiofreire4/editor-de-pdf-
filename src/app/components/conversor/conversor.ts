import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import * as mammoth from 'mammoth';
import { Document, ImageRun, Packer, Paragraph, TextRun } from 'docx';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

@Component({
  selector: 'app-conversor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversor.html',
  styleUrl: './conversor.css',
})
export class ConversorComponent {
  @ViewChild('pdfInput') pdfInput!: ElementRef<HTMLInputElement>;
  @ViewChild('wordInput') wordInput!: ElementRef<HTMLInputElement>;

  carregando = false;
  mensagem = '';
  erro = '';

  abrirPdf(): void { this.pdfInput.nativeElement.click(); }
  abrirWord(): void { this.wordInput.nativeElement.click(); }

  async converterPdfParaWord(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.iniciar('Convertendo páginas do PDF...');
    try {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const paragrafos: Paragraph[] = [];
      for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
        const page = await pdf.getPage(pagina);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível criar a imagem da página');
        await page.render({ canvasContext: context, viewport }).promise;
        const imagem = await this.dataUrlParaBytes(canvas.toDataURL('image/png'));
        const largura = 590;
        const altura = Math.round(largura * (viewport.height / viewport.width));
        paragrafos.push(new Paragraph({
          pageBreakBefore: pagina > 1,
          children: [new ImageRun({ data: imagem, type: 'png', transformation: { width: largura, height: altura } })],
        }));
        this.mensagem = `Lendo página ${pagina} de ${pdf.numPages}...`;
      }
      const documento = new Document({ sections: [{ children: paragrafos.length ? paragrafos : [new Paragraph('')] }] });
      const blob = await Packer.toBlob(documento);
      this.baixar(blob, `${file.name.replace(/\.pdf$/i, '')}.docx`);
      this.mensagem = 'PDF convertido para Word com sucesso.';
    } catch (error) {
      console.error('Erro ao converter PDF para DOCX:', error);
      this.erro = 'Não foi possível converter este PDF. PDFs escaneados podem precisar de OCR.';
    } finally {
      this.carregando = false;
    }
  }

  async converterWordParaPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.iniciar('Lendo o documento Word...');
    try {
      const resultado = await (mammoth.convertToHtml as any)({ arrayBuffer: await file.arrayBuffer() });
      const dom = new DOMParser().parseFromString(`<div>${resultado.value || ''}</div>`, 'text/html');
      const pdf = await this.criarPdf(dom.body.firstElementChild as HTMLElement);
      this.baixar(pdf, `${file.name.replace(/\.docx$/i, '')}.pdf`);
      this.mensagem = 'Word convertido para PDF com sucesso.';
    } catch (error) {
      console.error('Erro ao converter DOCX para PDF:', error);
      this.erro = 'Não foi possível converter este documento Word.';
    } finally {
      this.carregando = false;
    }
  }

  private async criarPdf(container: HTMLElement): Promise<Blob> {
    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const fonteNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);
    const largura = 595.28;
    const altura = 841.89;
    const margem = 56;
    let page = pdf.addPage([largura, altura]);
    let y = altura - margem;

    const novaPagina = () => {
      page = pdf.addPage([largura, altura]);
      y = altura - margem;
    };
    const desenharTexto = (texto: string, tamanho: number, negrito: boolean, recuo = 0) => {
      const fonteAtual: PDFFont = negrito ? fonteNegrito : fonte;
      const palavras = texto.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      let linha = '';
      const larguraUtil = largura - (margem * 2) - recuo;
      const linhas: string[] = [];
      for (const palavra of palavras) {
        const candidata = linha ? `${linha} ${palavra}` : palavra;
        if (fonteAtual.widthOfTextAtSize(candidata, tamanho) > larguraUtil && linha) {
          linhas.push(linha);
          linha = palavra;
        } else linha = candidata;
      }
      if (linha) linhas.push(linha);
      for (const trecho of linhas) {
        if (y < margem + tamanho) novaPagina();
        page.drawText(trecho, { x: margem + recuo, y, size: tamanho, font: fonteAtual });
        y -= tamanho * 1.5;
      }
      y -= tamanho * 0.35;
    };

    for (const node of Array.from(container.children)) {
      const elemento = node as HTMLElement;
      const tag = elemento.tagName.toLowerCase();
      const texto = elemento.textContent || '';
      const imagens = Array.from(elemento.tagName.toLowerCase() === 'img' ? [elemento as HTMLImageElement] : elemento.querySelectorAll('img'));
      for (const imagem of imagens) await desenharImagem(imagem as HTMLImageElement);
      if (!texto.trim()) { y -= 12; continue; }
      const titulo = /^h[1-6]$/.test(tag);
      desenharTexto(texto, titulo ? 15 : 11, titulo || tag === 'strong', titulo ? 0 : 0);
    }
    return new Blob([await pdf.save() as any], { type: 'application/pdf' });

    async function desenharImagem(imagem: HTMLImageElement): Promise<void> {
      const src = imagem.getAttribute('src') || '';
      const correspondencia = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(src);
      if (!correspondencia) return;
      const bytes = Uint8Array.from(atob(correspondencia[2]), (caractere) => caractere.charCodeAt(0));
      const incorporada = correspondencia[1].toLowerCase() === 'png'
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const larguraOriginal = Number(imagem.getAttribute('width')) || incorporada.width;
      const alturaOriginal = Number(imagem.getAttribute('height')) || incorporada.height;
      const larguraImagem = Math.min(largura - margem * 2, larguraOriginal);
      const alturaImagem = larguraImagem * (alturaOriginal / Math.max(larguraOriginal, 1));
      if (y < margem + alturaImagem) novaPagina();
      page.drawImage(incorporada, { x: margem, y: y - alturaImagem, width: larguraImagem, height: alturaImagem });
      y -= alturaImagem + 12;
    }
  }

  private async dataUrlParaBytes(dataUrl: string): Promise<Uint8Array> {
    const base64 = dataUrl.split(',')[1] || '';
    return Uint8Array.from(atob(base64), (caractere) => caractere.charCodeAt(0));
  }

  private iniciar(mensagem: string): void {
    this.carregando = true;
    this.mensagem = mensagem;
    this.erro = '';
  }

  private baixar(blob: Blob, nome: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
  }
}
