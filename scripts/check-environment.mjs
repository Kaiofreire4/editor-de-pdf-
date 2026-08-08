import process from 'node:process';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 12) {
  console.error(`Node.js incompatível: ${process.versions.node}. Use Node.js 22.12 ou superior na versão 22.`);
  process.exit(1);
}

try {
  const sqlite = await import('better-sqlite3');
  const Database = sqlite.default;
  const database = new Database(':memory:');
  database.close();
  console.log(`Ambiente pronto: Node.js ${process.versions.node} e better-sqlite3 carregado.`);
} catch (error) {
  console.error('Não foi possível carregar better-sqlite3.');
  console.error('Instale o Visual Studio Build Tools com o workload "Desktop development with C++" e execute npm install novamente.');
  console.error(`Detalhe: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
