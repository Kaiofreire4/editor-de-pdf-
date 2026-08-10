import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import * as mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';

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
    this.iniciar('Extraindo o texto do PDF...');
    try {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const paragrafos: Paragraph[] = [];
      for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
        const page = await pdf.getPage(pagina);
        const content = await page.getTextContent();
        const itens = content.items as Array<{ str?: string; transform?: number[] }>;
        const linhas = new Map<number, string[]>();
        for (const item of itens) {
          const texto = item.str?.trim();
          if (!texto) continue;
          const y = Math.round(item.transform?.[5] || 0);
          const chave = Array.from(linhas.keys()).find((valor) => Math.abs(valor - y) <= 3) ?? y;
          linhas.set(chave, [...(linhas.get(chave) || []), texto]);
        }
        [...linhas.entries()].sort((a, b) => b[0] - a[0]).forEach(([, textos]) => {
          paragrafos.push(new Paragraph({ children: [new TextRun(textos.join(' '))] }));
        });
        if (pagina < pdf.numPages) paragrafos.push(new Paragraph(''));
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
      if (!texto.trim()) { y -= 12; continue; }
      const titulo = /^h[1-6]$/.test(tag);
      desenharTexto(texto, titulo ? 15 : 11, titulo || tag === 'strong', titulo ? 0 : 0);
    }
    return new Blob([await pdf.save() as any], { type: 'application/pdf' });
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
