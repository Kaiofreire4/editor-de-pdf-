import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Importação correta apontando para os arquivos reais criados no seu projeto
import { OrganizarPdfComponent } from '../organizar-pdf/organizar-pdf';
import { EditarTextoComponent } from '../editar-texto/editar-texto';
import { VisualizarPdfComponent } from '../visualizar-pdf/visualizar-pdf';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    OrganizarPdfComponent,
    EditarTextoComponent,
    VisualizarPdfComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent {
  // Variável que controla qual aba está ativa na tela (substitui as abas do Tkinter)
  abaAtiva: string = 'organizar';

  // Função chamada ao clicar nos botões do menu lateral para trocar de aba
  mudarAba(aba: string) {
    this.abaAtiva = aba;
  }
}
