import { ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

interface Modelo {
  id: string;
  nome: string;
  categoria: string;
  html: string;
}

interface TracoWord {
  pontos: Array<{ x: number; y: number }>;
  cor: string;
}

@Component({
  selector: 'app-editor-word',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor-word.html',
  styleUrl: './editor-word.css',
})
export class EditorWordComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editor') editor!: ElementRef<HTMLDivElement>;
  @ViewChild('paperWrap') paperWrap!: ElementRef<HTMLDivElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  nomeArquivo = 'Novo documento';
  arquivoCarregado = false;
  carregando = false;
  mensagem = '';
  zoom = 100;
  familiaFonteWord = 'Calibri';
  corTextoWord = '#252938';
  normaAbntAtiva = false;
  imagemAtiva: HTMLImageElement | null = null;
  larguraImagem = 0;
  alturaImagem = 0;
  manterProporcaoImagem = true;
  modoMarcaTextoWord = false;
  corMarcaTextoWord = '#ffe45c';
  readonly coresMarcaTextoWord = [
    { nome: 'Amarelo', valor: '#ffe45c' },
    { nome: 'Verde', valor: '#8ee6a8' },
    { nome: 'Azul', valor: '#8fd3ff' },
    { nome: 'Rosa', valor: '#ff9ec4' },
    { nome: 'Laranja', valor: '#ffb86b' },
  ];
  readonly fontesWord = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana'];
  readonly coresTextoWord = ['#252938', '#6556d9', '#2f78c4', '#2e7d32', '#d32f2f', '#8a7200'];
  private selecaoWord: Range | null = null;
  modoBorrachaWord = false;
  tracosWord: TracoWord[] = [];
  private tracoWordEmAndamento: TracoWord | null = null;
  private imagemResizeWord: { startX: number; startY: number; width: number; height: number } | null = null;
  private imagemDragWord: { startX: number; startY: number; left: number; top: number } | null = null;

  // ---------- Modelos (estilo Canva) ----------
  mostrarModelos = false;
  dialogoAberto = false;
  tipoDialogo: 'tabela' | 'grafico' | 'link' = 'tabela';
  tabelaLinhas = 3;
  tabelaColunas = 3;
  dialogoTitulo = '';
  dialogoDados = '';
  dialogoUrl = '';

  modelos: Modelo[] = [
    {
      id: 'curriculo',
      nome: 'Currículo Profissional',
      categoria: 'Profissional',
      html: `<div class="tpl-titulo">Seu Nome</div>
<div class="tpl-cargo">Desenvolvedor(a) · Designer · Profissional</div>
<div class="tpl-contato">seu@email.com · (11) 99999-9999 · linkedin.com/in/voce · Cidade</div>
<hr class="tpl-divisao">
<h3 class="tpl-secao">Resumo</h3>
<p class="tpl-corpo">Escreva aqui um resumo profissional destacando suas principais competências, experiência e objetivos de carreira.</p>
<h3 class="tpl-secao">Experiência Profissional</h3>
<p class="tpl-cargo-menor"><b>Cargo</b> — Empresa (2022–2024)</p>
<p class="tpl-corpo">Descreva as responsabilidades, projetos e conquistas desta posição.</p>
<h3 class="tpl-secao">Formação Acadêmica</h3>
<p class="tpl-corpo"><b>Nome do curso</b> — Instituição de ensino</p>
<h3 class="tpl-secao">Habilidades</h3>
<ul class="tpl-lista">
<li>Habilidade 1</li>
<li>Habilidade 2</li>
<li>Habilidade 3</li>
</ul>`,
    },
    {
      id: 'certificado',
      nome: 'Certificado de Conclusão',
      categoria: 'Formal',
      html: `<div class="tpl-cabecalho" style="text-align:center">Certificado de Conclusão</div>
<p class="tpl-cert-corpo" style="text-align:center">Conferimos o presente certificado a</p>
<div class="tpl-cert-nome" style="text-align:center">Nome Completo</div>
<p class="tpl-cert-corpo" style="text-align:center">por concluir com êxito o curso de <b>Nome do Curso</b>, com carga horária de <b>X horas</b>.</p>
<div class="tpl-cert-data" style="text-align:center">São Paulo, 1º de janeiro de 2026</div>
<div class="tpl-cert-assinaturas">
<div class="tpl-assinatura"><div class="tpl-linha-assinatura"></div>Instrutor(a)</div>
<div class="tpl-assinatura"><div class="tpl-linha-assinatura"></div>Coordenação</div>
</div>`,
    },
    {
      id: 'convite',
      nome: 'Convite de Evento',
      categoria: 'Celebração',
      html: `<div class="tpl-faixa-convite">
<div class="tpl-convite-super">Você está convidado(a)</div>
<div class="tpl-convite-titulo">Festa de Aniversário</div>
<div class="tpl-convite-super">Com muita alegria e gratidão</div>
</div>
<div class="tpl-convite-info">
<div><b>Data:</b> Sábado, 15 de fevereiro</div>
<div><b>Horário:</b> 18h00</div>
<div><b>Local:</b> Rua das Flores, 123 — Bairro</div>
<div><b>Confirmação:</b> (11) 99999-9999</div>
</div>
<p class="tpl-convite-texto">Sua presença fará a festa ainda mais especial!</p>`,
    },
    {
      id: 'proposta',
      nome: 'Proposta Comercial',
      categoria: 'Profissional',
      html: `<div class="tpl-proposta-capa">
<div class="tpl-proposta-marca">Sua Empresa</div>
<div class="tpl-proposta-titulo">Proposta Comercial</div>
<div class="tpl-proposta-para">Para: Nome do Cliente</div>
<div class="tpl-proposta-data">Data: __/__/2026</div>
</div>
<h3 class="tpl-secao">Escopo do Projeto</h3>
<p class="tpl-corpo">Descreva aqui o objetivo, as entregas e o prazo do projeto.</p>
<h3 class="tpl-secao">Investimento</h3>
<table class="tpl-tabela">
<tr><th>Item</th><th>Valor</th></tr>
<tr><td>Item 1</td><td>R$ 1.000,00</td></tr>
<tr><td>Item 2</td><td>R$ 2.000,00</td></tr>
<tr><td><b>Total</b></td><td><b>R$ 3.000,00</b></td></tr>
</table>
<h3 class="tpl-secao">Condições Comerciais</h3>
<ul class="tpl-lista">
<li>Prazo de entrega: 15 dias úteis</li>
<li>Pagamento: 50% na aprovação e 50% na entrega</li>
</ul>`,
    },
    {
      id: 'relatorio',
      nome: 'Relatório de Atividades',
      categoria: 'Trabalho',
      html: `<div class="tpl-rel-titulo">Relatório de Atividades</div>
<div class="tpl-rel-meta">Período: Mês/Ano · Responsável: Seu Nome · Setor</div>
<div class="tpl-destaque"><b>Destaques:</b> principais resultados e metas atingidas no período.</div>
<h3 class="tpl-secao">Atividades Realizadas</h3>
<ul class="tpl-lista">
<li>Atividade 1</li>
<li>Atividade 2</li>
<li>Atividade 3</li>
</ul>
<h3 class="tpl-secao">Resultados</h3>
<table class="tpl-tabela">
<tr><th>Indicador</th><th>Meta</th><th>Realizado</th></tr>
<tr><td>Indicador 1</td><td>100%</td><td>95%</td></tr>
<tr><td>Indicador 2</td><td>50</td><td>47</td></tr>
</table>
<h3 class="tpl-secao">Próximos Passos</h3>
<p class="tpl-corpo">Descreva o planejamento para o próximo período.</p>`,
    },
    {
      id: 'carta',
      nome: 'Carta Formal',
      categoria: 'Formal',
      html: `<div class="tpl-carta-endereco">São Paulo, 1º de janeiro de 2026</div>
<div class="tpl-carta-endereco">Ao(a) Sr.(a) Nome do Destinatário<br>Empresa / Instituição<br>Endereço completo</div>
<div class="tpl-carta-assunto"><b>Assunto:</b> Assunto da carta</div>
<p class="tpl-corpo">Prezado(a) Senhor(a),</p>
<p class="tpl-corpo">Escreva aqui o corpo da carta, apresentando o motivo do contato e os detalhes solicitados.</p>
<p class="tpl-corpo">Desde já, agradeço a atenção e fico à disposição.</p>
<p class="tpl-corpo">Atenciosamente,</p>
<div class="tpl-carta-assinatura">Seu Nome<br>Cargo / Empresa</div>`,
    },
    {
      id: 'aula',
      nome: 'Material de Aula',
      categoria: 'Educação',
      html: `<div class="tpl-aula-cab">Material de Aula</div>
<div class="tpl-aula-titulo">Título da Aula</div>
<div class="tpl-destaque"><b>Objetivos:</b> ao final desta aula você será capaz de compreender e aplicar os conceitos apresentados.</div>
<h3 class="tpl-secao">Conteúdo Programático</h3>
<p class="tpl-corpo">Escreva aqui o conteúdo da aula, com exemplos e explicações.</p>
<h3 class="tpl-secao">Resumo</h3>
<ul class="tpl-lista">
<li>Ponto principal 1</li>
<li>Ponto principal 2</li>
<li>Ponto principal 3</li>
</ul>
<p class="tpl-corpo">Adicione exercícios ou referências conforme necessário.</p>`,
    },
  ];

  abrirModelos(): void {
    this.mostrarModelos = true;
  }

  fecharModelos(): void {
    this.mostrarModelos = false;
  }

  aplicarModelo(modelo: Modelo): void {
    this.editor.nativeElement.innerHTML = modelo.html;
    this.nomeArquivo = modelo.nome;
    this.arquivoCarregado = true;
    this.mensagem = 'Modelo aplicado. Clique nos elementos para editar — igual ao Canva.';
    this.mostrarModelos = false;
    this.cdr.detectChanges();
    this.editor.nativeElement.focus();
  }

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
    this.salvarSelecaoWord();
    this.tipoDialogo = 'tabela';
    this.tabelaLinhas = 3;
    this.tabelaColunas = 3;
    this.dialogoAberto = true;
  }

  abrirDialogoGrafico(): void {
    this.salvarSelecaoWord();
    this.tipoDialogo = 'grafico';
    this.dialogoTitulo = 'Gráfico';
    this.dialogoDados = 'Janeiro:10, Fevereiro:20';
    this.dialogoAberto = true;
  }

  abrirDialogoLink(): void {
    this.salvarSelecaoWord();
    this.tipoDialogo = 'link';
    this.dialogoUrl = 'https://';
    this.dialogoAberto = true;
  }

  fecharDialogo(): void {
    this.dialogoAberto = false;
  }

  confirmarDialogo(): void {
    if (this.tipoDialogo === 'tabela') {
      const linhas = Math.max(1, Math.min(20, Math.trunc(Number(this.tabelaLinhas))));
      const colunas = Math.max(1, Math.min(20, Math.trunc(Number(this.tabelaColunas))));

      let html = '<table class="tpl-tabela"><thead><tr>';
      for (let coluna = 1; coluna <= colunas; coluna++) html += `<th>Coluna ${coluna}</th>`;
      html += '</tr></thead><tbody>';
      for (let linha = 1; linha < linhas; linha++) {
        html += '<tr>';
        for (let coluna = 1; coluna <= colunas; coluna++) html += `<td>Texto ${linha}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table><p><br></p>';
      this.inserirHtml(html);
    } else if (this.tipoDialogo === 'grafico') {
      this.inserirGraficoComDados(this.dialogoTitulo, this.dialogoDados);
    } else {
      this.inserirLinkComUrl(this.dialogoUrl);
    }
    this.fecharDialogo();
  }

  inserirGrafico(): void {
    this.abrirDialogoGrafico();
  }

  private inserirGraficoComDados(titulo: string, dados: string): void {
    if (!titulo.trim() || !dados.trim()) return;

    const itens = dados.split(',').map((item) => {
      const [rotulo, valor] = item.split(':');
      return { rotulo: (rotulo || '').trim(), valor: Number((valor || '').trim()) };
    }).filter((item) => item.rotulo && Number.isFinite(item.valor) && item.valor >= 0).slice(0, 12);
    const maiorValor = Math.max(...itens.map((item) => item.valor), 1);
    if (itens.length === 0) return;

    const barras = itens.map((item) => `<div class="chart-row"><span>${item.rotulo}</span><i style="width:${Math.max(3, item.valor / maiorValor * 100)}%"></i><b>${item.valor}</b></div>`).join('');
    this.inserirHtml(`<div class="word-chart" contenteditable="false"><strong>${titulo.trim()}</strong>${barras}</div><p><br></p>`);
  }

  inserirLink(): void {
    this.abrirDialogoLink();
  }

  private inserirLinkComUrl(url: string): void {
    if (!url || !/^https?:\/\//i.test(url)) return;
    this.restaurarSelecaoWord();
    this.editor.nativeElement.focus();
    const selecao = window.getSelection()?.toString().trim();
    if (selecao) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  private inserirHtml(html: string): void {
    this.editor.nativeElement.focus();
    document.execCommand('insertHTML', false, html);
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
      const resultado = await (mammoth.convertToHtml as any)(
        { arrayBuffer },
        {
          includeDefaultStyleMap: true,
          ignoreEmptyParagraphs: false,
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => p.subtitle:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
          ],
        },
      );
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
    this.salvarSelecaoWord();
    this.restaurarSelecaoWord();
    this.editor.nativeElement.focus();
    document.execCommand(comando, false, valor);
  }

  alterarFamiliaFonteWord(fonte: string): void {
    this.familiaFonteWord = fonte;
    this.formatar('fontName', fonte);
  }

  aplicarCorTextoWord(cor: string): void {
    this.corTextoWord = cor;
    this.formatar('foreColor', cor);
  }

  desfazerWord(): void { this.formatar('undo'); }
  refazerWord(): void { this.formatar('redo'); }

  alterarFonte(tamanho: string): void {
    this.formatar('fontSize', tamanho);
  }

  alterarAlinhamento(alinhamento: 'left' | 'center' | 'right' | 'justify'): void {
    this.formatar(`justify${alinhamento.charAt(0).toUpperCase()}${alinhamento.slice(1)}`);
  }

  inserirLista(tipo: 'insertUnorderedList' | 'insertOrderedList'): void {
    this.formatar(tipo);
  }

  marcarTextoWord(): void {
    this.restaurarSelecaoWord();
    this.formatar('hiliteColor', this.corMarcaTextoWord);
    this.formatar('backColor', this.corMarcaTextoWord);
    this.desativarAnotacaoWord();
  }

  salvarSelecaoWord(): void {
    const selecao = window.getSelection();
    if (!selecao || selecao.rangeCount === 0 || selecao.isCollapsed) return;
    this.selecaoWord = selecao.getRangeAt(0).cloneRange();
  }

  restaurarSelecaoWord(): void {
    if (!this.selecaoWord) return;
    this.editor.nativeElement.focus();
    const selecao = window.getSelection();
    selecao?.removeAllRanges();
    selecao?.addRange(this.selecaoWord);
  }

  aplicarCorMarcaTextoWord(cor: string): void {
    this.corMarcaTextoWord = cor;
    this.restaurarSelecaoWord();
    this.marcarTextoWord();
  }

  removerMarcaTextoWord(): void {
    this.editor.nativeElement.focus();
    document.execCommand('hiliteColor', false, 'transparent');
    document.execCommand('backColor', false, 'transparent');
    this.desativarAnotacaoWord();
  }

  alternarMarcaTextoWord(): void {
    this.modoMarcaTextoWord = !this.modoMarcaTextoWord;
    this.modoBorrachaWord = false;
    this.imagemAtiva = null;
  }

  alternarBorrachaWord(): void {
    this.modoBorrachaWord = !this.modoBorrachaWord;
    this.modoMarcaTextoWord = false;
    this.imagemAtiva = null;
  }

  desativarAnotacaoWord(): void {
    this.modoMarcaTextoWord = false;
    this.modoBorrachaWord = false;
    this.tracoWordEmAndamento = null;
    this.cdr.detectChanges();
  }

  @HostListener('document:keydown.escape')
  sairDoModoAnotacaoWord(): void { this.desativarAnotacaoWord(); }

  selecionarImagemWord(event: MouseEvent): void {
    event.stopPropagation();
    const imagem = event.currentTarget as HTMLImageElement;
    this.imagemAtiva = imagem;
    this.larguraImagem = Math.round(imagem.getBoundingClientRect().width);
    this.alturaImagem = Math.round(imagem.getBoundingClientRect().height);
    this.modoMarcaTextoWord = false;
  }

  iniciarArrasteImagemWord(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.selecionarImagemWord(event);
    const imagem = this.imagemAtiva;
    if (!imagem) return;
    imagem.style.position = 'relative';
    this.imagemDragWord = {
      startX: event.clientX,
      startY: event.clientY,
      left: Number.parseFloat(imagem.style.left) || 0,
      top: Number.parseFloat(imagem.style.top) || 0,
    };
  }

  selecionarElementoWord(event: MouseEvent): void {
    const alvo = event.target as HTMLElement;
    if (alvo.tagName.toLowerCase() === 'img') this.selecionarImagemWord(event);
    else this.imagemAtiva = null;
  }

  iniciarArrasteSeImagem(event: PointerEvent): void {
    if ((event.target as HTMLElement).tagName.toLowerCase() === 'img') this.iniciarArrasteImagemWord(event);
  }

  alterarTamanhoImagemWord(dimensao: 'w' | 'h', valor: number): void {
    if (!this.imagemAtiva || !Number.isFinite(valor) || valor < 20) return;
    const proporcao = this.larguraImagem / Math.max(this.alturaImagem, 1);
    if (dimensao === 'w') {
      this.larguraImagem = valor;
      if (this.manterProporcaoImagem) this.alturaImagem = Math.round(valor / proporcao);
    } else {
      this.alturaImagem = valor;
      if (this.manterProporcaoImagem) this.larguraImagem = Math.round(valor * proporcao);
    }
    this.imagemAtiva.style.width = `${this.larguraImagem}px`;
    this.imagemAtiva.style.height = `${this.alturaImagem}px`;
  }

  get imagemBoundsWord(): { left: number; top: number; width: number; height: number } | null {
    if (!this.imagemAtiva || !this.paperWrap) return null;
    const imagem = this.imagemAtiva.getBoundingClientRect();
    const papel = this.paperWrap.nativeElement.getBoundingClientRect();
    const escala = this.zoom / 100;
    return { left: (imagem.left - papel.left) / escala, top: (imagem.top - papel.top) / escala, width: imagem.width / escala, height: imagem.height / escala };
  }

  iniciarResizeImagemWord(event: PointerEvent): void {
    if (!this.imagemAtiva) return;
    event.preventDefault();
    event.stopPropagation();
    this.imagemResizeWord = { startX: event.clientX, startY: event.clientY, width: this.larguraImagem, height: this.alturaImagem };
  }

  @HostListener('document:pointermove', ['$event'])
  redimensionarImagemWord(event: PointerEvent): void {
    if (this.imagemDragWord && this.imagemAtiva) {
      const estado = this.imagemDragWord;
      this.imagemAtiva.style.left = `${estado.left + event.clientX - estado.startX}px`;
      this.imagemAtiva.style.top = `${estado.top + event.clientY - estado.startY}px`;
      this.cdr.detectChanges();
      return;
    }
    const estado = this.imagemResizeWord;
    if (!estado) return;
    const dx = event.clientX - estado.startX;
    const dy = event.clientY - estado.startY;
    const proporcao = estado.width / Math.max(estado.height, 1);
    let largura = Math.max(20, estado.width + dx);
    let altura = Math.max(20, estado.height + dy);
    if (this.manterProporcaoImagem) {
      if (Math.abs(dx) >= Math.abs(dy)) altura = largura / proporcao;
      else largura = altura * proporcao;
    }
    this.alterarTamanhoImagemWord('w', largura);
    if (!this.manterProporcaoImagem) this.alterarTamanhoImagemWord('h', altura);
    this.cdr.detectChanges();
  }

  @HostListener('document:pointerup')
  finalizarResizeImagemWord(): void {
    this.imagemResizeWord = null;
    this.imagemDragWord = null;
  }

  iniciarTracoWord(event: PointerEvent): void {
    if (this.modoBorrachaWord) {
      this.apagarTracoWord(event);
      return;
    }
    if (!this.modoMarcaTextoWord) return;
    event.preventDefault();
    const svg = event.currentTarget as SVGElement;
    const ponto = this.pontoWord(event, svg);
    svg.setPointerCapture(event.pointerId);
    this.tracoWordEmAndamento = { pontos: [ponto], cor: this.corMarcaTextoWord };
    this.tracosWord = [...this.tracosWord, this.tracoWordEmAndamento];
  }

  private apagarTracoWord(event: PointerEvent): void {
    const svg = event.currentTarget as SVGElement;
    const ponto = this.pontoWord(event, svg);
    let indice = -1;
    let menorDistancia = 18;
    this.tracosWord.forEach((traco, tracoIndex) => traco.pontos.forEach((item) => {
      const distancia = Math.hypot(item.x - ponto.x, item.y - ponto.y);
      if (distancia < menorDistancia) { menorDistancia = distancia; indice = tracoIndex; }
    }));
    if (indice >= 0) {
      this.tracosWord = this.tracosWord.filter((_, index) => index !== indice);
      this.cdr.detectChanges();
    }
  }

  continuarTracoWord(event: PointerEvent): void {
    if (!this.tracoWordEmAndamento) return;
    event.preventDefault();
    const ponto = this.pontoWord(event, event.currentTarget as SVGElement);
    this.tracoWordEmAndamento.pontos.push(ponto);
    this.cdr.detectChanges();
  }

  finalizarTracoWord(event: PointerEvent): void {
    if (!this.tracoWordEmAndamento) return;
    event.preventDefault();
    this.tracoWordEmAndamento = null;
  }

  pontosTracoWord(traco: TracoWord): string {
    return traco.pontos.map((ponto) => `${ponto.x},${ponto.y}`).join(' ');
  }

  private pontoWord(event: PointerEvent, svg: SVGElement): { x: number; y: number } {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  alternarNormaAbnt(): void {
    this.normaAbntAtiva = !this.normaAbntAtiva;
    this.editor.nativeElement.classList.toggle('abnt-document', this.normaAbntAtiva);
    if (this.normaAbntAtiva) {
      this.aplicarEstilosAbnt();
      this.atualizarSumarioAbnt();
      this.atualizarReferenciasAbnt();
      this.mensagem = 'Norma ABNT aplicada: margens, fonte, espaçamento, títulos e sumário configurados.';
    } else {
      this.editor.nativeElement.querySelector('.abnt-sumario')?.remove();
      this.mensagem = 'Formatação ABNT desativada. O conteúdo foi preservado.';
    }
    this.cdr.detectChanges();
  }

  aplicarNivelTitulo(nivel: string): void {
    if (!nivel) return;
    const tag = `h${nivel}`;
    this.formatar('formatBlock', `<${tag}>`);
    if (this.normaAbntAtiva) {
      this.aplicarEstilosAbnt();
      this.atualizarSumarioAbnt();
    }
  }

  atualizarSumario(): void {
    if (!this.normaAbntAtiva) return;
    this.atualizarSumarioAbnt();
    this.mensagem = 'Sumário atualizado com os títulos do documento.';
  }

  private aplicarEstilosAbnt(): void {
    const titulos = this.editor.nativeElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
    titulos.forEach((titulo, index) => {
      const elemento = titulo as HTMLElement;
      elemento.classList.add('abnt-heading');
      elemento.dataset['abntLevel'] = elemento.tagName.substring(1);
      elemento.id = elemento.id || `titulo-abnt-${index + 1}`;
    });
  }

  private atualizarSumarioAbnt(): void {
    this.editor.nativeElement.querySelector('.abnt-sumario')?.remove();
    const titulos = Array.from(this.editor.nativeElement.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter((titulo) => !(titulo as HTMLElement).closest('.abnt-sumario')) as HTMLElement[];
    if (titulos.length === 0) return;

    const sumario = document.createElement('nav');
    sumario.className = 'abnt-sumario';
    sumario.contentEditable = 'false';
    sumario.innerHTML = '<h1>SUMÁRIO</h1>';
    const lista = document.createElement('ol');
    titulos.forEach((titulo) => {
      const item = document.createElement('li');
      item.dataset['level'] = titulo.tagName.substring(1);
      item.textContent = titulo.textContent?.trim() || 'Título sem texto';
      lista.appendChild(item);
    });
    sumario.appendChild(lista);
    this.editor.nativeElement.prepend(sumario);
  }

  private atualizarReferenciasAbnt(): void {
    this.editor.nativeElement.querySelector('.abnt-referencias')?.remove();
    const urls = new Set<string>();
    const urlRegex = /https?:\/\/[^\s<]+/gi;
    const links = this.editor.nativeElement.querySelectorAll('a[href]');
    links.forEach((link) => {
      if ((link as HTMLElement).closest('.abnt-sumario')) return;
      const url = (link as HTMLAnchorElement).href;
      if (/^https?:\/\//i.test(url)) urls.add(url.replace(/[.,;:)]$/, ''));
    });

    const walker = document.createTreeWalker(this.editor.nativeElement, NodeFilter.SHOW_TEXT);
    const nos: Text[] = [];
    let no: Node | null;
    while ((no = walker.nextNode())) nos.push(no as Text);

    for (const texto of nos) {
      if (texto.parentElement?.closest('a, .abnt-sumario, .abnt-referencias')) continue;
      urlRegex.lastIndex = 0;
      let encontro: RegExpExecArray | null;
      while ((encontro = urlRegex.exec(texto.data))) {
        urls.add(encontro[0].replace(/[.,;:)]$/, ''));
      }
    }

    if (urls.size === 0) return;
    const referencias = document.createElement('section');
    referencias.className = 'abnt-referencias';
    referencias.contentEditable = 'false';
    const titulo = document.createElement('h1');
    titulo.textContent = 'REFERÊNCIAS';
    referencias.appendChild(titulo);
    urls.forEach((url) => {
      const paragrafo = document.createElement('p');
      paragrafo.append('Disponível em: ');
      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      paragrafo.append(link, `. Acesso em: ${new Intl.DateTimeFormat('pt-BR').format(new Date())}.`);
      referencias.appendChild(paragrafo);
    });
    this.editor.nativeElement.appendChild(referencias);
  }

  aumentarZoom(): void {
    this.zoom = Math.min(150, this.zoom + 10);
  }

  reduzirZoom(): void {
    this.zoom = Math.max(70, this.zoom - 10);
  }

  async exportar(): Promise<void> {
    if (this.normaAbntAtiva) {
      this.aplicarEstilosAbnt();
      this.atualizarSumarioAbnt();
      this.atualizarReferenciasAbnt();
    }
    const paragraphs = this.criarParagrafos(this.editor.nativeElement);
    const documento = new Document({
      sections: [{
        properties: this.normaAbntAtiva ? {
          page: { margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 } },
        } : {},
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')],
      }],
      styles: this.normaAbntAtiva ? {
        default: {
          document: {
            run: { font: 'Times New Roman', size: 24 },
            paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 0 } },
          },
        },
      } : undefined,
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
    return Array.from(container.children).flatMap((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.classList.contains('abnt-sumario')) {
        const itens = Array.from(htmlElement.querySelectorAll('li')).map((item) => new Paragraph({
          text: item.textContent || '',
          indent: { left: (Number((item as HTMLElement).dataset['level'] || 1) - 1) * 360 },
          spacing: { line: 360, after: 0 },
        }));
        return [new Paragraph({ text: 'SUMÁRIO', heading: HeadingLevel.HEADING_1 }), ...itens];
      }
      if (htmlElement.classList.contains('abnt-referencias')) {
        const itens = Array.from(htmlElement.querySelectorAll('p')).map((item) => new Paragraph({
          children: this.criarRuns(item),
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, after: 0 },
        }));
        return [new Paragraph({ text: 'REFERÊNCIAS', heading: HeadingLevel.HEADING_1 }), ...itens];
      }
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
      if (this.normaAbntAtiva && !/^h[1-6]$/.test(tag)) {
        props['alignment'] = AlignmentType.JUSTIFIED;
        props['indent'] = { firstLine: 709 };
        props['spacing'] = { line: 360, after: 0 };
      }

      return [new Paragraph({ ...props, children: this.criarRuns(htmlElement) } as never)];
    });
  }

  private criarLink(link: HTMLAnchorElement): ExternalHyperlink {
    return new ExternalHyperlink({
      link: link.href,
      children: [new TextRun({ text: link.textContent || link.href, style: 'Hyperlink' })],
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

  private criarRuns(element: Node): Array<TextRun | ExternalHyperlink> {
    const runs: Array<TextRun | ExternalHyperlink> = [];
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
      if (tag === 'a') {
        runs.push(this.criarLink(child as HTMLAnchorElement));
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
        const background = this.corHtmlParaHex(child.style.backgroundColor);
        runs.push(new TextRun({ text, shading: background ? { fill: background } : undefined }));
      }
    });
    return runs.length > 0 ? runs : [new TextRun('')];
  }

  private corHtmlParaHex(cor: string): string | null {
    const match = /^#([0-9a-f]{6})$/i.exec(cor || '');
    if (match) return match[1].toUpperCase();
    const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(cor || '');
    if (!rgb) return null;
    return [rgb[1], rgb[2], rgb[3]].map((valor) => Number(valor).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
}
