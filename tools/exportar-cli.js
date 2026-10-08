'use strict';

/**
 * Exporta uma encomenda para Excel sem abrir a app.
 *   node tools/exportar-cli.js <id> [--base <pasta>] [--saida <ficheiro.xlsx>]
 */

const path = require('path');
const os = require('os');
const db = require('../src/main/db');
const encomendas = require('../src/main/db/repos/encomendas');
const definicoes = require('../src/main/db/repos/definicoes');
const { exportar, nomeSugerido } = require('../src/main/servicos/exportar');

async function main() {
  const args = process.argv.slice(2);
  const id = Number(args.find((a) => !a.startsWith('--')));
  if (!id) {
    console.error('Falta o id da encomenda. Uso: node tools/exportar-cli.js <id>');
    process.exit(1);
  }

  const iBase = args.indexOf('--base');
  const pasta = iBase >= 0 ? args[iBase + 1] : path.join(os.homedir(), 'AppData', 'Roaming', 'Encomendas');
  const iSaida = args.indexOf('--saida');

  db.abrir(pasta);
  const encomenda = encomendas.porId(id);
  if (!encomenda) throw new Error(`Nao existe a encomenda ${id}.`);

  const destino = iSaida >= 0
    ? path.resolve(args[iSaida + 1])
    : path.join(os.homedir(), 'Desktop', nomeSugerido(encomenda));

  const r = await exportar(encomenda, destino, {
    titulo: definicoes.ler('titulo_exportacao'),
    alturaLinha: definicoes.ler('export_altura_linha'),
    alturaFoto: definicoes.ler('export_foto_altura')
  });

  console.log(`Escrito:    ${r.caminho}`);
  console.log(`Tamanho:    ${(r.bytes / 1024).toFixed(0)} KB`);
  console.log(`Clientes:   ${r.clientes}`);
  console.log(`Camisolas:  ${r.camisolas}`);
  if (r.semFoto.length) console.log(`Sem foto:   ${r.semFoto.length}`);
  db.fechar();
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
