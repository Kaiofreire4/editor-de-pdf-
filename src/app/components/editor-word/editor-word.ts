import { ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

@Component({
  selector: 'app-editor-word',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor-word.html',
  styleUrl: './editor-word.css',
})
export class EditorWordComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editor') editor!: ElementRef<HTMLDivElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  nomeArquivo = 'Novo documento';
  arquivoCarregado = false;
  carregando = false;
  mensagem = '';
  zoom = 100;

  abrirArquivo(): void {
    this.fileInput.nativeElement.click();
  }

  abrirImagem(): void {
    this.imageInput.nativeElement.click();
  }

  inserirSelecionado(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const acao = select.value;
    select.value = '';
    if (acao === 'imagem') this.abrirImagem();
    if (acao === 'tabela') this.inserirTabela();
    if (acao === 'grafico') this.inserirGrafico();
    if (acao === 'link') this.inserirLink();
  }

  inserirImagem(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      this.editor.nativeElement.focus();
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${src}" alt="Imagem inserida" style="max-width:100%;height:auto">`,
      );
    };
    reader.readAsDataURL(file);
  }

  inserirTabela(): void {
    const linhas = this.lerNumero('Quantas linhas?', 3);
    const colunas = this.lerNumero('Quantas colunas?', 3);
    if (!linhas || !colunas) return;

    let html = '<table><thead><tr>';
    for (let coluna = 1; coluna <= colunas; coluna++) html += `<th>Coluna ${coluna}</th>`;
    html += '</tr></thead><tbody>';
    for (let linha = 1; linha < linhas; linha++) {
      html += '<tr>';
      for (let coluna = 1; coluna <= colunas; coluna++) html += `<td>Texto ${linha}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    this.inserirHtml(html);
  }

  inserirGrafico(): void {
    const titulo = window.prompt('Título do gráfico:', 'Gráfico');
    if (titulo === null) return;
    const dados = window.prompt('Informe os dados no formato: Janeiro:10, Fevereiro:20', 'Janeiro:10, Fevereiro:20');
    if (!dados) return;

    const itens = dados.split(',').map((item) => {
      const [rotulo, valor] = item.split(':');
      return { rotulo: (rotulo || '').trim(), valor: Number((valor || '').trim()) };
    }).filter((item) => item.rotulo && Number.isFinite(item.valor) && item.valor >= 0).slice(0, 12);
    const maiorValor = Math.max(...itens.map((item) => item.valor), 1);
    if (itens.length === 0) return;

    const barras = itens.map((item) => `<div class="chart-row"><span>${item.rotulo}</span><i style="width:${Math.max(3, item.valor / maiorValor * 100)}%"></i><b>${item.valor}</b></div>`).join('');
    this.inserirHtml(`<div class="word-chart" contenteditable="false"><strong>${titulo}</strong>${barras}</div><p><br></p>`);
  }

  inserirLink(): void {
    const url = window.prompt('Cole o endereço do link:', 'https://');
    if (!url || !/^https?:\/\//i.test(url)) return;
    this.editor.nativeElement.focus();
    const selecao = window.getSelection()?.toString().trim();
    if (selecao) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  private inserirHtml(html: string): void {
    this.editor.nativeElement.focus();
    document.execCommand('insertHTML', false, html);
  }

  private lerNumero(mensagem: string, padrao: number): number | null {
    const valor = window.prompt(mensagem, String(padrao));
    if (valor === null) return null;
    const numero = Number.parseInt(valor, 10);
    return Number.isInteger(numero) && numero > 0 && numero <= 20 ? numero : null;
  }

  async selecionarArquivo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      this.mensagem = 'Selecione um documento .docx do Word.';
      return;
    }

    this.carregando = true;
    this.mensagem = 'Abrindo documento...';
    try {
      const arrayBuffer = await file.arrayBuffer();
      const resultado = await mammoth.convertToHtml({ arrayBuffer });
      this.editor.nativeElement.innerHTML = resultado.value || '<p><br></p>';
      await this.aplicarDimensoesOriginais(arrayBuffer);
      this.nomeArquivo = file.name.replace(/\.docx$/i, '');
      this.arquivoCarregado = true;
      this.mensagem = resultado.messages.length > 0
        ? 'Documento aberto. Alguns elementos avançados podem ter sido simplificados.'
        : 'Documento aberto para edição.';
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Erro ao abrir DOCX:', error);
      this.mensagem = 'Não foi possível abrir este documento Word.';
      this.cdr.detectChanges();
    } finally {
      this.carregando = false;
      this.cdr.detectChanges();
    }
  }

  criarDocumento(): void {
    this.editor.nativeElement.innerHTML = '<h1>Novo documento</h1><p>Comece a escrever aqui...</p>';
    this.nomeArquivo = 'Novo documento';
    this.arquivoCarregado = true;
    this.mensagem = 'Novo documento criado.';
    this.editor.nativeElement.focus();
  }

  formatar(comando: string, valor?: string): void {
    this.editor.nativeElement.focus();
    document.execCommand(comando, false, valor);
  }

  alterarFonte(tamanho: string): void {
    this.formatar('fontSize', tamanho);
  }

  alterarAlinhamento(alinhamento: 'left' | 'center' | 'right' | 'justify'): void {
    this.formatar(`justify${alinhamento.charAt(0).toUpperCase()}${alinhamento.slice(1)}`);
  }

  inserirLista(tipo: 'insertUnorderedList' | 'insertOrderedList'): void {
    this.formatar(tipo);
  }

  aumentarZoom(): void {
    this.zoom = Math.min(150, this.zoom + 10);
  }

  reduzirZoom(): void {
    this.zoom = Math.max(70, this.zoom - 10);
  }

  async exportar(): Promise<void> {
    const paragraphs = this.criarParagrafos(this.editor.nativeElement);
    const documento = new Document({
      sections: [{
        properties: {},
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')],
      }],
      numbering: {
        config: [
          {
            reference: 'word-bullets',
            levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT }],
          },
          {
            reference: 'word-numbers',
            levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }],
          },
        ],
      },
    });

    const blob = await Packer.toBlob(documento);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.nomeArquivo || 'documento'}.docx`;
    link.click();
    URL.revokeObjectURL(url);
    this.mensagem = 'Documento exportado com sucesso.';
  }

  private criarParagrafos(container: HTMLElement): Paragraph[] {
    return Array.from(container.children).map((element) => {
      const htmlElement = element as HTMLElement;
      const tag = htmlElement.tagName.toLowerCase();
      const props: Record<string, unknown> = {};

      if (/^h[1-6]$/.test(tag)) {
        props['heading'] = {
          h1: HeadingLevel.HEADING_1,
          h2: HeadingLevel.HEADING_2,
          h3: HeadingLevel.HEADING_3,
          h4: HeadingLevel.HEADING_4,
          h5: HeadingLevel.HEADING_5,
          h6: HeadingLevel.HEADING_6,
        }[tag];
      }
      const alinhamento = htmlElement.style.textAlign;
      if (alinhamento === 'center') props['alignment'] = AlignmentType.CENTER;
      if (alinhamento === 'right') props['alignment'] = AlignmentType.RIGHT;
      if (alinhamento === 'justify') props['alignment'] = AlignmentType.JUSTIFIED;
      if (htmlElement.closest('ol')) props['numbering'] = { reference: 'word-numbers', level: 0 };
      else if (htmlElement.closest('ul')) props['bullet'] = { level: 0 };

      return new Paragraph({ ...props, children: this.criarRuns(htmlElement) } as never);
    });
  }

  /** Word stores image dimensions in EMUs; converting them prevents Mammoth's
   * HTML fallback from expanding an image to the full page width. */
  private async aplicarDimensoesOriginais(arrayBuffer: ArrayBuffer): Promise<void> {
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const documentoXml = await zip.file('word/document.xml')?.async('string');
      if (!documentoXml) return;

      const xml = new DOMParser().parseFromString(documentoXml, 'application/xml');
      const extensoes = Array.from(xml.getElementsByTagNameNS(
        'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
        'extent',
      ));
      const imagens = Array.from(this.editor.nativeElement.querySelectorAll('img'));
      imagens.forEach((imagem, index) => {
        const extensao = extensoes[index];
        if (!extensao) return;
        const larguraEmu = Number(extensao.getAttribute('cx'));
        const alturaEmu = Number(extensao.getAttribute('cy'));
        if (!Number.isFinite(larguraEmu) || !Number.isFinite(alturaEmu) || larguraEmu <= 0 || alturaEmu <= 0) return;

        // 9,525 EMUs = 1 CSS pixel at Word's standard 96 DPI.
        imagem.style.width = `${larguraEmu / 9525}px`;
        imagem.style.height = `${alturaEmu / 9525}px`;
        imagem.style.maxWidth = '100%';
        imagem.style.objectFit = 'contain';
      });
    } catch (error) {
      console.warn('Não foi possível recuperar as dimensões das imagens:', error);
    }
  }

  private criarRuns(element: Node): TextRun[] {
    const runs: TextRun[] = [];
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) runs.push(new TextRun(node.textContent));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const child = node as HTMLElement;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        runs.push(new TextRun({ text: '', break: 1 }));
        return;
      }
      const text = child.textContent || '';
      if (['strong', 'b', 'em', 'i', 'u', 's', 'strike'].includes(tag)) {
        runs.push(new TextRun({
          text,
          bold: tag === 'strong' || tag === 'b',
          italics: tag === 'em' || tag === 'i',
          underline: tag === 'u' ? {} : undefined,
          strike: tag === 's' || tag === 'strike',
        }));
      } else if (child.children.length > 0) {
        runs.push(...this.criarRuns(child));
      } else if (text) {
        runs.push(new TextRun(text));
      }
    });
    return runs.length > 0 ? runs : [new TextRun('')];
  }
}
