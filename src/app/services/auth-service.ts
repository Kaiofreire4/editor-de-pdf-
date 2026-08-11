import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { tap, timeout } from 'rxjs/operators';

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: UsuarioAutenticado;
}

export const API_BASE_URL = '/.netlify/functions';
const TOKEN_KEY = 'pdfmaster_token';
const GUEST_KEY = 'pdfmaster_convidado';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly _userSubject = new BehaviorSubject<UsuarioAutenticado | null>(null);
  private readonly _acessoSubject = new BehaviorSubject<boolean>(false);
  private readonly _iconeSubject = new BehaviorSubject<string | null>(null);
  private iconeObjectUrl: string | null = null;
  private restauracaoEmAndamento: Promise<boolean> | null = null;

  readonly user$: Observable<UsuarioAutenticado | null> = this._userSubject.asObservable();

  /** Reage a qualquer modo que permita entrar no app (login real ou convidado). */
  readonly acesso$: Observable<boolean> = this._acessoSubject.asObservable();
  readonly icone$: Observable<string | null> = this._iconeSubject.asObservable();

  get user(): UsuarioAutenticado | null {
    return this._userSubject.value;
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return this._acessoSubject.value;
  }

  get isConvidado(): boolean {
    return localStorage.getItem(GUEST_KEY) === '1';
  }

  registrar(nome: string, email: string, senha: string): Promise<void> {
    return this.executar(
      this.http.post<AuthResponse>(`${API_BASE_URL}/auth-register`, { nome, email, senha }),
    );
  }

  entrar(email: string, senha: string): Promise<void> {
    return this.executar(
      this.http.post<AuthResponse>(`${API_BASE_URL}/auth-login`, { email, senha }),
    );
  }

  entrarComoConvidado(): void {
    localStorage.setItem(GUEST_KEY, '1');
    localStorage.removeItem(TOKEN_KEY);
    this._userSubject.next(null);
    this.limparIcone();
    this._acessoSubject.next(true);
  }

  restaurar(): Promise<boolean> {
    if (this.isAuthenticated) return Promise.resolve(true);
    if (this.restauracaoEmAndamento) return this.restauracaoEmAndamento;

    this.restauracaoEmAndamento = this.restaurarSessao().finally(() => {
      this.restauracaoEmAndamento = null;
    });
    return this.restauracaoEmAndamento;
  }

  private restaurarSessao(): Promise<boolean> {
    if (this.isConvidado) {
      this._acessoSubject.next(true);
      return Promise.resolve(true);
    }

    const token = this.token;
    if (!token) return Promise.resolve(false);
    try {
      return firstValueFrom(
        this.http
          .get<{ user: UsuarioAutenticado }>(`${API_BASE_URL}/auth-me`, { headers: this.headers() })
          .pipe(timeout({ first: 10000 }))
          .pipe(tap(({ user }) => {
            this._userSubject.next(user);
            this._acessoSubject.next(true);
          })),
      ).then(() => true).catch(() => {
        this.limpar();
        return false;
      });
    } catch {
      return Promise.resolve(false);
    }
  }

  sair(): void {
    const token = this.token;
    if (token) {
      this.http
        .post(`${API_BASE_URL}/auth-logout`, null, { headers: this.headers() })
        .subscribe({ error: () => undefined });
    }
    this.limpar();
  }

  async carregarIcone(): Promise<void> {
    if (!this.token || this.isConvidado) {
      this.limparIcone();
      return;
    }
    try {
      const blob = await firstValueFrom(this.http.get(`${API_BASE_URL}/profile-icon?v=${Date.now()}`, { headers: this.headers(), responseType: 'blob' }).pipe(timeout({ first: 10000 })));
      this.limparIcone();
      this.iconeObjectUrl = URL.createObjectURL(blob);
      this._iconeSubject.next(this.iconeObjectUrl);
    } catch {
      this.limparIcone();
    }
  }

  async salvarIcone(arquivo: File): Promise<void> {
    const dados = new FormData();
    dados.append('icon', arquivo, arquivo.name);
    await firstValueFrom(this.http.put(`${API_BASE_URL}/profile-icon`, dados, { headers: this.headers() }).pipe(timeout({ first: 10000 })));
    await this.carregarIcone();
  }

  private headers(): Record<string, string> {
    const token = this.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private executar(operacao: Observable<AuthResponse>): Promise<void> {
    return firstValueFrom(
      operacao.pipe(
        timeout({ first: 10000 }),
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.token);
          localStorage.removeItem(GUEST_KEY);
          this._userSubject.next(res.user);
          this._acessoSubject.next(true);
        }),
      ),
    ).then(async () => {
      await this.carregarIcone();
    });
  }

  private limpar(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GUEST_KEY);
    this._userSubject.next(null);
    this._acessoSubject.next(false);
    this.limparIcone();
  }

  private limparIcone(): void {
    if (this.iconeObjectUrl) URL.revokeObjectURL(this.iconeObjectUrl);
    this.iconeObjectUrl = null;
    this._iconeSubject.next(null);
  }
}
