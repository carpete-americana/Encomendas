'use strict';

/**
 * Teste de aceitacao: importa o Excel real de 28/06/2026 e exporta-o de volta.
 * Salta sozinho se o ficheiro nao estiver na secretaria.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

// O ficheiro tem de ter precos: a copia exportada pela app nao os leva, e a
// 21/09/2026 uma exportacao foi gravada por cima do original.
const CANDIDATOS = ['ENCOMENDA_28_06_2026(AutoRecovered).xlsx', 'ENCOMENDA_28_06_2026.xlsx']
  .map((f) => path.join(os.homedir(), 'Desktop', f));
const ORIGEM = CANDIDATOS.find((f) => fs.existsSync(f) && fs.statSync(f).size > 2 * 1024 * 1024);
const existe = !!ORIGEM;

const db = require('../src/main/db');
const { importar } = require('../src/main/servicos/importar');
const { exportar } = require('../src/main/servicos/exportar');
const camisolas = require('../src/main/db/repos/camisolas');
const clientes = require('../src/main/db/repos/clientes');
const encomendas = require('../src/main/db/repos/encomendas');

let pasta;
let resultado;

test('importar o Excel real', { skip: !existe && 'ENCOMENDA_28_06_2026.xlsx nao esta na secretaria' }, async (t) => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-teste-'));
  db.abrir(pasta);
  resultado = await importar(ORIGEM);

  await t.test('conta os clientes e as camisolas certas', () => {
    assert.equal(resultado.clientes, 14);
    assert.equal(resultado.camisolas, 63);
  });

  await t.test('os totais batem com a folha', () => {
    // Somados a mao do XML: coluna L = 600,00, coluna N = 825,00, ambas com 63
    // celulas. A caixa "Valores" dizia 829 de total e estava desatualizada.
    assert.equal(resultado.totais.totalFornecedor, 60000);
    assert.equal(resultado.totais.totalCliente, 82500);
    assert.equal(resultado.totais.lucro, 22500);
  });

  await t.test('as camisolas repetidas entram uma vez so no catalogo', () => {
    const catalogo = camisolas.listar({ incluirArquivadas: true });
    assert.ok(catalogo.length < 63, 'houve deduplicacao');
    assert.equal(
      catalogo.reduce((t2, c) => t2 + c.vezes_encomendada, 0), 63,
      'as 63 linhas continuam todas ligadas a uma camisola'
    );
  });

  await t.test('camisolas de nome parecido nao sao fundidas', () => {
    for (const nome of ['Portugal 2026', 'Portugal 2026 Home Kit', 'Portugal principal 2026']) {
      assert.ok(camisolas.porChave(nome), `"${nome}" tem de existir por si`);
    }
  });

  await t.test('praticamente tudo ficou com foto', () => {
    assert.ok(resultado.fotosGuardadas > 40, `${resultado.fotosGuardadas} fotos guardadas`);
    assert.equal(resultado.semFoto, 0);
  });

  await t.test('as fotos encolheram', () => {
    const fotos = fs.readdirSync(path.join(pasta, 'fotos'));
    const bytes = fotos.reduce((t2, f) => t2 + fs.statSync(path.join(pasta, 'fotos', f)).size, 0);
    assert.ok(bytes < 4 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(1)} MB, contra os 16 MB do original`);
  });

  await t.test('os tamanhos de crianca sobreviveram como tamanhos', () => {
    const linhas = encomendas.linhasDe(resultado.encomenda_id);
    const tamanhos = new Set(linhas.map((l) => l.tamanho));
    assert.ok(tamanhos.has('26'), 'ha camisolas de tamanho 26');
    assert.ok(tamanhos.has('XXL'));
  });

  await t.test('margem zero foi preservada onde existia', () => {
    const linhas = encomendas.linhasDe(resultado.encomenda_id);
    const gabriel = clientes.porChave('GABRIEL / SARA');
    assert.ok(gabriel, 'a Gabriel/Sara existe');
    const delas = linhas.filter((l) => l.cliente_id === gabriel.id);
    assert.ok(delas.length > 0);
    assert.ok(
      delas.every((l) => l.preco_cliente === l.preco_fornecedor),
      'as camisolas dela foram ao custo e tem de continuar a ser'
    );
  });

  await t.test('importar duas vezes e recusado sem ser pedido', async () => {
    await assert.rejects(() => importar(ORIGEM), /Ja existe/);
  });
});

test('exportar de volta nao leva preco nenhum', { skip: !existe && 'sem ficheiro de origem' }, async (t) => {
  const destino = path.join(pasta, 'saida.xlsx');
  const encomenda = encomendas.porId(resultado.encomenda_id);
  const r = await exportar(encomenda, destino, { titulo: 'ENCOMENDA CAMISOLAS - {data}' });

  assert.equal(r.clientes, 14);
  assert.equal(r.camisolas, 63);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(destino);
  const ws = wb.worksheets[0];

  await t.test('a folha tem os 14 blocos e as 63 linhas', () => {
    let nClientes = 0;
    let nItens = 0;
    for (let linha = 2; linha <= ws.rowCount; linha += 1) {
      const c = ws.getCell(linha, 1);
      if (c.isMerged && c.master && c.master.row !== linha) continue;
      if (!c.value) continue;
      const t2 = String(c.value).trim().toUpperCase();
      if (String(ws.getCell(linha + 1, 1).value || '').trim().toUpperCase() === 'ITEM') { nClientes += 1; continue; }
      if (t2 === 'ITEM') continue;
      nItens += 1;
    }
    assert.equal(nClientes, 14);
    assert.equal(nItens, 63);
  });

  await t.test('cada camisola levou a sua foto', () => {
    assert.equal(ws.getImages().length, 63);
  });

  await t.test('nao ha uma unica celula numerica', () => {
    // Um preco no Excel e sempre um numero. Zero numeros = zero precos.
    let numeros = 0;
    ws.eachRow((linha) => linha.eachCell((c) => { if (typeof c.value === 'number') numeros += 1; }));
    assert.equal(numeros, 0, 'nenhum preco pode chegar ao fornecedor');
  });

  await t.test('as colunas sao so as quatro da lista de producao', () => {
    const cabecalhos = new Set();
    ws.eachRow((linha) => linha.eachCell((c) => {
      if (String(c.value).trim().toUpperCase() === 'ITEM') {
        for (let col = 1; col <= 20; col += 1) {
          const v = ws.getCell(linha.number, col).value;
          if (v) cabecalhos.add(String(v).trim());
        }
      }
    }));
    assert.deepEqual([...cabecalhos].sort(), [
      'ITEM', 'NOME - NUMERO - SIMBOLO', 'PERSONALIZAÇÃO', 'TAMANHO'
    ].sort());
  });

  await t.test('a personalizacao e sempre SIM ou traco', () => {
    const vistos = new Set();
    ws.eachRow((linha) => {
      const c = ws.getCell(linha.number, 6);
      // O titulo e o nome do cliente estao fundidos em largura, por isso a
      // coluna 6 devolve o valor da coluna A nessas linhas.
      if (c.isMerged && c.master && c.master.address !== c.address) return;
      if (c.value) vistos.add(String(c.value).trim());
    });
    vistos.delete('PERSONALIZAÇÃO');
    assert.deepEqual([...vistos].sort(), ['-', 'SIM']);
  });
});

test.after(() => {
  db.fechar();
  if (pasta) fs.rmSync(pasta, { recursive: true, force: true });
});
