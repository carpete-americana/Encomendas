'use strict';

/**
 * Importa um Excel antigo pela linha de comandos, sem abrir a app.
 *   node tools/importar-cli.js <ficheiro.xlsx> [--base <pasta>] [--ensaio] [--substituir]
 *
 * `--ensaio` le e mostra o que encontrou sem escrever nada.
 */

const path = require('path');
const os = require('os');
const db = require('../src/main/db');
const { analisar, importar } = require('../src/main/servicos/importar');
const { formatar } = require('../src/main/servicos/dinheiro');

function pastaPorOmissao() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Encomendas');
}

async function main() {
  const args = process.argv.slice(2);
  const ficheiro = args.find((a) => !a.startsWith('--'));
  if (!ficheiro) {
    console.error('Falta o ficheiro. Uso: node tools/importar-cli.js <ficheiro.xlsx> [--ensaio]');
    process.exit(1);
  }

  const iBase = args.indexOf('--base');
  const pasta = iBase >= 0 ? args[iBase + 1] : pastaPorOmissao();
  const ensaio = args.includes('--ensaio');
  const substituir = args.includes('--substituir');

  db.abrir(pasta);
  console.log(`Base:      ${db.caminhos().base}`);
  console.log(`Ficheiro:  ${path.resolve(ficheiro)}\n`);

  if (ensaio) {
    const a = await analisar(path.resolve(ficheiro));
    console.log(`Titulo:    ${a.titulo}`);
    console.log(`Data:      ${a.data}\n`);
    for (const c of a.clientes) {
      console.log(`  ${c.nome}  (${c.itens.length})`);
      for (const i of c.itens) {
        console.log(
          `    ${i.foto || i.imageId !== undefined ? '[foto]' : '[    ]'} ` +
          `${i.nome.padEnd(52).slice(0, 52)} ${String(i.tamanho || '-').padStart(4)} ` +
          `${i.personalizacao ? 'SIM' : ' - '} ${String(i.personalizacaoTexto || '-').padEnd(30).slice(0, 30)} ` +
          `${formatar(i.precoFornecedor).padStart(9)} -> ${formatar(i.precoCliente).padStart(9)}`
        );
      }
    }
    console.log('\nResumo:', a.resumo);
    a.avisos.forEach((x) => console.log('AVISO:', x));
    db.fechar();
    return;
  }

  const r = await importar(path.resolve(ficheiro), { substituir });
  console.log('Importado.\n');
  console.log(`  Clientes:                ${r.clientes}`);
  console.log(`  Camisolas na encomenda:  ${r.camisolas}`);
  console.log(`  Novas no catalogo:       ${r.camisolasNovasNoCatalogo}`);
  console.log(`  Ja conhecidas:           ${r.camisolasJaConhecidas}`);
  console.log(`  Fotos guardadas:         ${r.fotosGuardadas}`);
  console.log(`  Sem foto:                ${r.semFoto}`);
  console.log(`  Total fornecedor:        ${formatar(r.totais.totalFornecedor)}`);
  console.log(`  Total cliente:           ${formatar(r.totais.totalCliente)}`);
  console.log(`  Lucro:                   ${formatar(r.totais.lucro)}`);
  r.avisos.forEach((x) => console.log('AVISO:', x));
  db.fechar();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
