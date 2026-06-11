import { Component } from '@angular/core';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  // CORREÇÃO: Adicionados FormsModule e CommonModule na lista oficial abaixo
  imports: [CommonModule, RouterOutlet, RouterModule, FormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  title = 'pdf-master-web';

  arquivoSelecionado: File | null = null;
  paginaDe: number = 1;
  paginaAte: number = 5;

  constructor(private http: HttpClient) {}

  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.arquivoSelecionado = event.target.files[0];
    }
  }
}
