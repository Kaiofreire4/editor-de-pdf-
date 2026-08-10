import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth-service';

type Modo = 'entrar' | 'cadastrar';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent implements OnInit {
  modo: Modo = 'entrar';
  nome = '';
  email = '';
  senha = '';
  confirmarSenha = '';
  carregando = false;
  erro = '';

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.auth.restaurar();
    if (this.auth.isAuthenticated) {
      void this.router.navigateByUrl('/editar-texto');
    }
  }

  get titulo(): string {
    return this.modo === 'entrar' ? 'Entrar' : 'Criar conta';
  }

  alternarModo(modo: Modo): void {
    this.modo = modo;
    this.erro = '';
  }

  async enviar(): Promise<void> {
    this.erro = '';
    this.carregando = true;
    try {
      if (this.modo === 'entrar') {
        await this.auth.entrar(this.email.trim(), this.senha);
      } else {
        const nomeLimpo = this.nome.trim();
        if (nomeLimpo.length < 2) {
          this.erro = 'Informe seu nome.';
          return;
        }
        if (this.senha !== this.confirmarSenha) {
          this.erro = 'As senhas não coincidem.';
          return;
        }
        await this.auth.registrar(nomeLimpo, this.email.trim(), this.senha);
      }
      void this.router.navigateByUrl('/editar-texto');
    } catch (error: any) {
      this.erro = this.mensagemErro(error);
    } finally {
      this.carregando = false;
    }
  }

  async entrarComoConvidado(): Promise<void> {
    this.auth.entrarComoConvidado();
    await this.router.navigateByUrl('/editar-texto');
  }

  private mensagemErro(error: any): string {
    if (error?.name === 'TimeoutError') return 'A API demorou para responder. Tente novamente em alguns segundos.';
    if (error?.error?.error) return error.error.error;
    if (typeof error?.message === 'string') return error.message;
    return 'Não foi possível concluir a operação. Tente novamente.';
  }
}
