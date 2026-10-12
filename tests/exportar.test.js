'use strict';

/** O Excel da encomenda: o que leva escolhe-se, e o que nao se escolhe nao vai. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const db = require('../src/main/db');
const encomendas = require('../src/main/db/repos/encomendas');
const { exportar, normalizarEscolha, OMISSAO } = require('../src/main/servicos/exportar');
const { lerFolha, texto } = require('./_folha');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-exportar-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

const e = encomendas.criar({ data: '2026-10-12', titulo: 'Teste' });
const add = (cliente, camisola, tamanho, extra = {}) => encomendas.adicionarLinha(e.id, {
  cliente_nome: cliente, camisola_nome: camisola, tamanho, preco_fornecedor: 1000, ...extra
});
add('Tiago Bastos', 'Portugal 2026 Home Kit', 'L');
add('Tiago Bastos', 'Benfica 2025/26 Away Kit', 'M');
const rita = add('Rita Lopes', 'Portugal 2026 Home Kit', 'S', { personalizacao: true, personalizacao_texto: 'Rita - 10' });
const devolver = add('Rita Lopes', 'Sporting 2025/26 Third Kit', 'XL');
encomendas.atualizarLinha(devolver, { estado_chegada: 'em_falta' });

let k = 0;
async function folha(opcoes) {
  const destino = path.join(pasta, `saida-${(k += 1)}.xlsx`);
  const r = await exportar(encomendas.porId(e.id), destino, opcoes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(destino);
  const ws = wb.worksheets[0];
  const todos = [];
  ws.eachRow((row) => row.eachCell((c) => {
    if (c.isMerged && c.master.address !== c.address) return; // so a celula principal de cada bloco unido
    if (c.value !== null && c.value !== undefined) todos.push(texto(c.value));
  }));
  return { r, ws, todos, lido: lerFolha(ws) };
}

test('por omissao: agrupado por cliente, sem precos', async () => {
  const { r, lido, todos } = await folha({});
  assert.deepEqual(lido.cabecalhos, ['Nº', 'FOTO', 'ITEM', 'TAMANHO', 'PERSONALIZAÇÃO', 'NOME - NÚMERO - SÍMBOLO']);
  assert.deepEqual(lido.clientes, ['TIAGO BASTOS', 'RITA LOPES']);
  assert.equal(lido.itens.length, 4);
  assert.equal(lido.totais.length, 0);
  assert.ok(!todos.some((t) => /PREÇO|TOTAL/i.test(t)));
  assert.equal(r.comPrecos, false);
  // Um cabecalho so, la em cima.
  assert.equal(todos.filter((t) => t === 'ITEM').length, 1);
});

test('sem clientes, nenhum nome aparece e as camisolas vao todas', async () => {
  const { r, todos, lido } = await folha({ clientes: 'nenhum', campos: OMISSAO.campos });
  const tudo = todos.join(' | ').toUpperCase();
  assert.ok(!tudo.includes('TIAGO') && !tudo.includes('BASTOS') && !tudo.includes('LOPES'), tudo);
  assert.equal(lido.itens.length, 4);
  assert.equal(r.semClientes, true);
  // O nome escrito na personalizacao e para estampar, por isso fica.
  assert.ok(todos.includes('Rita - 10'));
});

test('o "sem clientes" de antes continua a funcionar', () => {
  assert.equal(normalizarEscolha({ semClientes: true }).clientes, 'nenhum');
  assert.deepEqual(normalizarEscolha({ campos: ['foto', 'inventado'] }).campos, ['foto']);
});

test('clientes numa coluna', async () => {
  const { lido } = await folha({ clientes: 'coluna', campos: ['tamanho'] });
  assert.deepEqual(lido.cabecalhos, ['Nº', 'ITEM', 'CLIENTE', 'TAMANHO']);
  assert.deepEqual(lido.clientes, []);
  assert.deepEqual(lido.itens.map((i) => i.CLIENTE), ['Tiago Bastos', 'Tiago Bastos', 'Rita Lopes', 'Rita Lopes']);
});

test('com precos: numeros a serio, subtotais e total sem as para devolver', async () => {
  const { r, lido } = await folha({ clientes: 'blocos', campos: ['preco_fornecedor', 'preco_cliente', 'pago'] });
  assert.equal(r.comPrecos, true);
  assert.deepEqual(lido.cabecalhos, ['Nº', 'ITEM', 'PREÇO FORNECEDOR', 'PREÇO CLIENTE', 'PAGO']);

  const linhaRita = encomendas.porId(e.id).linhas.find((l) => l.id === rita);
  const itemRita = lido.itens.find((i) => i.ITEM === 'Portugal 2026 Home Kit' && i.cliente === 'RITA LOPES');
  assert.equal(itemRita['PREÇO FORNECEDOR'], linhaRita.preco_fornecedor / 100);
  assert.equal(itemRita['PREÇO CLIENTE'], linhaRita.preco_cliente / 100);

  const total = lido.totais.find((t) => t.rotulo === 'TOTAL');
  const t = encomendas.porId(e.id).totais;
  assert.equal(total['PREÇO FORNECEDOR'].result, t.totalFornecedor / 100);
  assert.equal(total['PREÇO CLIENTE'].result, t.totalCliente / 100);
  assert.ok(lido.totais.some((x) => x.rotulo === 'Total Tiago Bastos'));
});

test('sem foto escolhida nao vai foto nenhuma', async () => {
  const { ws, lido } = await folha({ clientes: 'blocos', campos: ['tamanho'] });
  assert.ok(!lido.cabecalhos.includes('FOTO'));
  assert.equal(ws.getImages().length, 0);
});
