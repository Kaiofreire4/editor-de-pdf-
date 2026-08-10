# MEU PDF

Aplicação web para editar PDFs e documentos Word usando Angular, Node.js e Express.

## Recursos

- Edição de texto em PDF, organização e visualização de PDFs
- Editor de documentos `.docx` com importação e exportação
- Inserção de imagens, tabelas, gráficos e links no Editor Word
- Login, cadastro e modo convidado
- Usuários e sessões persistidos em SQLite
- PDFs editados salvos localmente no navegador

## Requisitos no Windows

Instale estes programas antes de executar o projeto:

1. **Node.js 22.12 ou superior na versão 22**: https://nodejs.org/en/download
2. **Git**: https://git-scm.com/downloads
3. **Visual Studio Build Tools**: https://visualstudio.microsoft.com/visual-cpp-build-tools/

No instalador do Visual Studio, marque:

- `Desktop development with C++`
- `MSVC C++ build tools`
- `Windows 10/11 SDK`

O Visual Studio Build Tools é necessário porque o SQLite usa o pacote nativo `better-sqlite3`. Ele não pode ser instalado pelo npm sozinho.

Confira as versões:

```powershell
node --version
npm --version
git --version
```

O Node deve mostrar uma versão `22.12.x` ou superior dentro da série 22.

## Instalação em um PC novo

Clone o repositório e instale as dependências:

```powershell
git clone https://github.com/Kaiofreire4/editor-de-pdf-.git
cd editor-de-pdf-
npm install
npm run check:environment
```

O comando `npm install` instala todas as dependências JavaScript, incluindo Angular, PDF, Word e SQLite. O banco será criado automaticamente em `.data/pdfmaster.db` na primeira execução da API.

## Como executar

Abra dois terminais na pasta do projeto.

### Terminal 1: API

```powershell
npm run server
```

A API ficará disponível em `http://127.0.0.1:8000`.

Swagger: `http://127.0.0.1:8000/api-docs`

### Terminal 2: frontend

```powershell
npm start
```

Acesse `http://localhost:4200`.

## Atualizar um projeto já clonado

Se não houver alterações locais:

```powershell
git checkout master
git pull origin master
npm install
```

Se o Git reclamar que `angular.json` ou outro arquivo local será sobrescrito, guarde as alterações:

```powershell
git stash push -m "alteracoes locais"
git pull origin master
npm install
```

## Erros comuns

### `better-sqlite3` não instala

Verifique se o Visual Studio Build Tools foi instalado com `Desktop development with C++`. Depois feche os terminais e execute:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run check:environment
```

### `ts-node não é reconhecido`

O `npm install` não terminou. Corrija o erro do SQLite e execute `npm install` novamente.

### Porta ocupada

Feche o processo que já está usando a porta 4200 ou 8000 e execute os comandos novamente.

## Build de produção

```powershell
npm run build
```

O resultado será gerado em `dist/pdf-master-web`.
