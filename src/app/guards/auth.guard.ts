import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth-service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    if (this.auth.isAuthenticated) return of(true);

    // Restaura a sessão: token real OU modo convidado salvo no navegador.
    return from(this.auth.restaurar()).pipe(
      map((temAcesso) => temAcesso || this.router.createUrlTree(['/login'])),
    );
  }
}