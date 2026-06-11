import { Routes } from '@angular/router';
import { EditarTextoComponent } from './components/editar-texto/editar-texto';
import { OrganizarPdfComponent } from './components/organizar-pdf/organizar-pdf';
import { VisualizarPdfComponent } from './components/visualizar-pdf/visualizar-pdf';

export const routes: Routes = [
  // Quando abrir o app, vai direto para a tela de editar texto
  { path: '', redirectTo: 'editar-texto', pathMatch: 'full' },

  // Rotas isoladas baseadas exatamente nos nomes das suas pastas
  { path: 'editar-texto', component: EditarTextoComponent },
  { path: 'organizar-pdf', component: OrganizarPdfComponent },
  { path: 'visualizar-pdf', component: VisualizarPdfComponent }
];
