import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PDFDocument } from 'pdf-lib';

@Component({
  selector: 'app-organizar-pdf',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './organizar-pdf.html',
  styleUrl: './organizar-pdf.css'
})
export class OrganizarPdfComponent {
  // Estados para a ação de Juntar
  arquivosParaJuntar: File[] = [];

  // Estados para a ação de Cortar
  arquivoParaCortar: File | null = null;
  paginaDe: number = 1;
  paginaAte: number = 1;

  mensagemStatus: string = 'Pronto';

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
    this.mensagemStatus = 'Pronto';
  }

  // Detecta seleção de arquivos para JUNTAR
  onArquivosJuntarSelecionados(event: any) {
    if (event.target.files) {
      this.arquivosParaJuntar = Array.from(event.target.files);
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
    }
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

      // Validação dos inputs de página (igual você fazia no Python)
      if (this.paginaDe < 1 || this.paginaAte > totalPaginas || this.paginaDe > this.paginaAte) {
        alert(`Insira números válidos! O PDF possui ${totalPaginas} páginas.`);
        return;
      }

      const novoPdf = await PDFDocument.create();

      // Criando o array de índices (ex: de 1 até 3 vira os índices 0, 1, 2)
      const indicesParaCopiar = [];
      for (let i = this.paginaDe - 1; i < this.paginaAte; i++) {
        indicesParaCopiar.push(i);
      }

      const paginasRecortadas = await novoPdf.copyPages(pdfOriginal, indicesParaCopiar);
      paginasRecortadas.forEach((page) => novoPdf.addPage(page));

      const pdfBytes = await novoPdf.save();
      this.fazerDownload(pdfBytes, 'pdf_recortado_master.pdf');
      this.mensagemStatus = `Páginas ${this.paginaDe} a ${this.paginaAte} extraídas com sucesso.`;
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
