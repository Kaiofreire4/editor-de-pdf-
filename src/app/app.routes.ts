import { Routes } from '@angular/router';
import { EditarTextoComponent } from './components/editar-texto/editar-texto';
import { OrganizarPdfComponent } from './components/organizar-pdf/organizar-pdf';
import { VisualizarPdfComponent } from './components/visualizar-pdf/visualizar-pdf';
import { LoginComponent } from './components/login/login';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  // Ao abrir o app, vai para a tela de login
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },

  // Rotas isoladas baseadas exatamente nos nomes das suas pastas
  { path: 'editar-texto', component: EditarTextoComponent, canActivate: [AuthGuard] },
  { path: 'organizar-pdf', component: OrganizarPdfComponent, canActivate: [AuthGuard] },
  { path: 'visualizar-pdf', component: VisualizarPdfComponent, canActivate: [AuthGuard] },

  { path: '**', redirectTo: 'login' }
];
