import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import * as pdfjsLib from 'pdfjs-dist';

@Component({
  selector: 'app-editar-texto',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  templateUrl: './editar-texto.html',
  styleUrl: './editar-texto.css'
})
export class EditarTextoComponent {
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  arquivoSelecionado: File | null = null;
  pdfCarregado: boolean = false;
  paginaAtual: number = 1;
  totalPaginas: number = 0;
  pdfDoc: any = null;
  escala: number = 1.5;

  spansDaPagina: any[] = [];
  textoDoSpanSelecionado: string = '';
  indexSpanSelecionado: number | null = null;

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'font': [] }],
      [{ 'align': [] }],
      ['clean']
    ]
  };

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.arquivoSelecionado = file;

    try {
      const versao = pdfjsLib.version;
      const extensao = versao.startsWith('4') ? 'mjs' : 'js';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versao}/pdf.worker.min.${extensao}`;

      const fileUrl = URL.createObjectURL(file);
      this.pdfDoc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
      this.totalPaginas = this.pdfDoc.numPages;
      this.paginaAtual = 1;

      await this.renderizarPagina(this.paginaAtual);
    } catch (error: any) {
      console.error(error);
      alert('Erro ao carregar o arquivo PDF. Verifique o console.');
    }
  }

  async renderizarPagina(numPagina: number) {
    if (!this.pdfDoc) return;

    try {
      const page = await this.pdfDoc.getPage(numPagina);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');

      if (!context) return;

      const viewport = page.getViewport({ scale: this.escala });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = { canvasContext: context, viewport: viewport };
      await page.render(renderContext).promise;

      this.indexSpanSelecionado = null;
      this.textoDoSpanSelecionado = '';

      await this.buscarSpansDoPython(numPagina);
    } catch (error) {
      console.error('Erro ao renderizar página:', error);
    }
  }

  async buscarSpansDoPython(numPagina: number) {
    if (!this.arquivoSelecionado || !this.pdfDoc) return;

    const formData = new FormData();
    formData.append('file', this.arquivoSelecionado);
    formData.append('page', (numPagina - 1).toString());

    try {
      const resposta = await fetch('http://127.0.0.1:8000/extrair-textos', {
        method: 'POST',
        body: formData
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        this.spansDaPagina = dados.spans.map((span: any) => ({
          text: span.text,
          textoOriginal: span.text,
          bbox: [
            span.bbox[0] * this.escala,
            span.bbox[1] * this.escala,
            span.bbox[2] * this.escala,
            span.bbox[3] * this.escala
          ],
          modificado: false
        }));
        this.pdfCarregado = true;
        return;
      }
    } catch (error) {
      console.error('API desconectada. Certifique-se de ligar o terminal do backend.');
      alert('Erro: O servidor da API está offline! Ligue-o no terminal.');
    }
  }

  focarEEditarSpan(index: number) {
    this.indexSpanSelecionado = index;
    this.textoDoSpanSelecionado = this.spansDaPagina[index].htmlFormatado || this.spansDaPagina[index].text;
  }

  atualizarTextoDiretoNaFolha(novoTexto: string) {
    if (this.indexSpanSelecionado !== null) {
      const span = this.spansDaPagina[this.indexSpanSelecionado];
      span.text = novoTexto;

      if (novoTexto.trim() !== span.textoOriginal.trim()) {
        span.modificado = true;
      } else {
        span.modificado = false;
      }

      span.htmlFormatado = `<p>${novoTexto}</p>`;
      this.textoDoSpanSelecionado = novoTexto;
    }
  }

  atualizarTextoEmTempoReal() {
    if (this.indexSpanSelecionado !== null) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.textoDoSpanSelecionado;
      let textoLimpo = tempDiv.innerText || tempDiv.textContent || '';
      textoLimpo = textoLimpo.replace(/\n$/, '');

      const span = this.spansDaPagina[this.indexSpanSelecionado];
      span.text = textoLimpo;
      span.htmlFormatado = this.textoDoSpanSelecionado;

      if (textoLimpo.trim() !== span.textoOriginal.trim()) {
        span.modificado = true;
      } else {
        span.modificado = false;
      }
    }
  }

  get zoomPercent(): number {
    return Math.round(this.escala * 100);
  }

  get palavraCount(): number {
    return this.spansDaPagina.reduce(
      (total, span) => total + (span.text || '').trim().split(/\s+/).filter(Boolean).length,
      0
    );
  }

  async exportarPdf() {
    if (!this.arquivoSelecionado) return;

    const spansModificados = this.spansDaPagina
      .filter(span => span.modificado)
      .map(span => ({
        text: span.text,
        textoOriginal: span.textoOriginal,
        htmlFormatado: span.htmlFormatado || `<p>${span.text}</p>`,
        pageIndex: this.paginaAtual - 1,
        bbox: [
          span.bbox[0] / this.escala,
          span.bbox[1] / this.escala,
          span.bbox[2] / this.escala,
          span.bbox[3] / this.escala
        ]
      }));

    const formData = new FormData();
    formData.append('file', this.arquivoSelecionado);
    formData.append('modificacoes', JSON.stringify(spansModificados));

    try {
      const resposta = await fetch('http://127.0.0.1:8000/salvar-pdf', {
        method: 'POST',
        body: formData
      });

      if (resposta.ok) {
        const blob = await resposta.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'pdf_editado_master.pdf';
        link.click();
      } else {
        alert('Erro ao processar o salvamento na API.');
      }
    } catch (error) {
      alert('Erro ao falar com a API.');
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
