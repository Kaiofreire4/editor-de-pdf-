# PdfMasterWeb

Editor de PDFs web com interface no estilo **Microsoft Word**. O projeto usa **Angular** no frontend e uma **API em TypeScript (Node/Express)** para processar os PDFs.

## Requisitos

- Node.js 20+ (testado com Node 24)
- npm

## Instalação

```bash
npm install
```

## Como rodar

### 1. API (backend) — porta 8000

```bash
npm run server
```

> Opcional: modo com reload automático (`npm run server:dev`).

A API compila o TypeScript na hora com `ts-node`. Ela expõe:

- **`POST /extrair-textos`** — extrai os textos de uma página do PDF com coordenadas (`multipart/form-data`: `file` + `page`).
- **`POST /salvar-pdf`** — aplica alterações de texto e retorna o PDF editado (`multipart/form-data`: `file` + `modificacoes`).
- **`GET /api-docs`** — Swagger UI interativo para testar os endpoints.

### 2. Frontend (Angular) — porta 4200

Em outro terminal:

```bash
npm start
```

Abra `http://localhost:4200/`.

## Estrutura

```
src/
├── app/                    # Frontend Angular
│   ├── components/
│   │   ├── editar-texto/   # Editor de texto (estilo Word)
│   │   ├── organizar-pdf/  # Juntar e cortar PDFs
│   │   └── visualizar-pdf/ # Leitor de PDF
│   └── services/           # Serviços (PdfManager)
└── server/                 # API em TypeScript (Express)
    └── api-master.ts
```

## Como a API edita o texto

1. O frontend renderiza o PDF com `pdf.js` e pede os textos à API.
2. Ao salvar, o frontend envia as alterações (texto original + novo texto + posição).
3. A API localiza o texto original com `pdf.js`, apaga cobrindo com um retângulo branco e escreve o novo texto na mesma posição usando `pdf-lib`.

## Build de produção

```bash
npm run build
```
