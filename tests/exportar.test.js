'use strict';

/** O Excel para o fornecedor, com e sem os nomes dos clientes. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const db = require('../src/main/db');
const encomendas = require('../src/main/db/repos/encomendas');
const { exportar } = require('../src/main/servicos/exportar');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-exportar-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

const e = encomendas.criar({ data: '2026-10-12', titulo: 'Teste' });
encomendas.adicionarLinha(e.id, { cliente_nome: 'Tiago Bastos', camisola_nome: 'Portugal 2026 Home Kit', tamanho: 'L', preco_fornecedor: 1000 });
encomendas.adicionarLinha(e.id, { cliente_nome: 'Tiago Bastos', camisola_nome: 'Benfica 2025/26 Away Kit', tamanho: 'M', preco_fornecedor: 1000 });
encomendas.adicionarLinha(e.id, { cliente_nome: 'Rita Lopes', camisola_nome: 'Portugal 2026 Home Kit', tamanho: 'S', personalizacao: true, personalizacao_texto: 'Rita - 10', preco_fornecedor: 1000 });

async function textos(opcoes) {
  const destino = path.join(pasta, `saida-${Date.now()}.xlsx`);
  const r = await exportar(encomendas.porId(e.id), destino, opcoes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(destino);
  const ws = wb.worksheets[0];
  const todos = [];
  ws.eachRow((row) => row.eachCell((c) => {
    if (c.isMerged && c.master.address !== c.address) return; // so a celula principal de cada bloco unido
    if (c.value !== null && c.value !== undefined) todos.push(String(c.value));
  }));
  return { r, todos };
}

test('com clientes, cada um tem o seu bloco', async () => {
  const { r, todos } = await textos({});
  assert.ok(todos.includes('TIAGO BASTOS'));
  assert.ok(todos.includes('RITA LOPES'));
  assert.equal(r.semClientes, false);
  assert.equal(todos.filter((t) => t === 'ITEM').length, 2);
});

test('sem clientes, nenhum nome aparece e as camisolas vao todas', async () => {
  const { r, todos } = await textos({ semClientes: true });
  const tudo = todos.join(' | ').toUpperCase();
  assert.ok(!tudo.includes('TIAGO') && !tudo.includes('BASTOS'), tudo);
  assert.ok(!tudo.includes('LOPES'), tudo);
  assert.equal(r.camisolas, 3);
  assert.equal(r.semClientes, true);
  assert.ok(todos.includes('Portugal 2026 Home Kit'));
  assert.ok(todos.includes('Benfica 2025/26 Away Kit'));
  // O nome escrito na personalizacao e para estampar, por isso fica.
  assert.ok(todos.includes('Rita - 10'));
  // Um cabecalho so.
  assert.equal(todos.filter((t) => t === 'ITEM').length, 1);
  assert.equal(todos.filter((t) => t === 'Portugal 2026 Home Kit').length, 2);
});
