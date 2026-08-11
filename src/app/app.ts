import { Component, OnInit, inject } from '@angular/core';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { LocalPdfRecord, LocalPdfStorageService } from './services/local-pdf-storage';
import { AuthService, UsuarioAutenticado } from './services/auth-service';
import { EditorRouteReuseStrategy } from './services/editor-route-reuse-strategy';

@Component({
  selector: 'app-root',
  standalone: true,
  // CORREÇÃO: Adicionados FormsModule e CommonModule na lista oficial abaixo
  imports: [CommonModule, RouterOutlet, RouterModule, FormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  title = 'pdf-master-web';

  arquivoSelecionado: File | null = null;
  paginaDe: number = 1;
  paginaAte: number = 5;
  tema: 'light' | 'dark' = localStorage.getItem('pdfmaster-theme') === 'dark' ? 'dark' : 'light';
  arquivosLocaisAbertos = false;
  arquivosLocais: LocalPdfRecord[] = [];
  usuarioAtual: UsuarioAutenticado | null = null;
  iconePerfil: string | null = null;
  autenticado = false;
  private localPdfStorage = inject(LocalPdfStorageService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private routeReuse = inject(EditorRouteReuseStrategy);

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    this.usuarioAtual = this.auth.user;
    this.autenticado = this.auth.isAuthenticated;
    if (!this.auth.isAuthenticated) {
      await this.auth.restaurar();
    }
    this.auth.user$.subscribe((user) => {
      this.usuarioAtual = user;
      if (user) void this.auth.carregarIcone();
    });
    this.auth.icone$.subscribe((icone) => (this.iconePerfil = icone));
    this.auth.acesso$.subscribe((temAcesso) => (this.autenticado = temAcesso));
    this.autenticado = this.auth.isAuthenticated;
    if (this.autenticado) await this.auth.carregarIcone();
    await this.carregarArquivosLocais();
  }

  inicialDoNome(): string {
    return (this.usuarioAtual?.nome || (this.auth.isConvidado ? 'PV' : '?')).trim().charAt(0).toUpperCase() || '?';
  }

  sair() {
    this.routeReuse.limpar();
    this.auth.sair();
    void this.router.navigateByUrl('/login');
  }

  async onIconeSelecionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type) || arquivo.size > 1024 * 1024) {
      alert('Escolha uma imagem PNG, JPG ou WebP de até 1 MB.');
      return;
    }
    try {
      await this.auth.salvarIcone(arquivo);
    } catch {
      alert('Não foi possível salvar o ícone na sua conta.');
    }
  }

  alternarTema() {
    this.tema = this.tema === 'light' ? 'dark' : 'light';
    localStorage.setItem('pdfmaster-theme', this.tema);
  }

  async alternarArquivosLocais() {
    this.arquivosLocaisAbertos = !this.arquivosLocaisAbertos;
    if (this.arquivosLocaisAbertos) await this.carregarArquivosLocais();
  }

  private async carregarArquivosLocais() {
    try {
      this.arquivosLocais = await this.localPdfStorage.listPdfs();
    } catch (error) {
      console.warn('Armazenamento local indisponível:', error);
      this.arquivosLocais = [];
    }
  }

  baixarArquivoLocal(arquivo: LocalPdfRecord) {
    const url = URL.createObjectURL(arquivo.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = arquivo.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  async excluirArquivoLocal(arquivo: LocalPdfRecord) {
    await this.localPdfStorage.deletePdf(arquivo.id);
    this.arquivosLocais = this.arquivosLocais.filter((item) => item.id !== arquivo.id);
  }

  formatarData(timestamp: number): string {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
  }

  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.arquivoSelecionado = event.target.files[0];
    }
  }
}
