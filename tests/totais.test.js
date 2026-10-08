'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { calcularTotais, contarPorTamanho } = require('../src/main/servicos/totais');
const { agruparPorCliente } = require('../src/main/servicos/agrupar');

function linha(extra = {}) {
  return {
    id: 1, cliente_id: 1, cliente_nome: 'A', posicao: 1,
    preco_fornecedor: 1000, preco_cliente: 1400,
    estado_chegada: 'pendente', pago: false, tamanho: 'L',
    ...extra
  };
}

test('uma encomenda vazia nao rebenta nem divide por zero', () => {
  const t = calcularTotais([]);
  assert.equal(t.nCamisolas, 0);
  assert.equal(t.lucro, 0);
  assert.equal(t.lucroMedio, 0);
  assert.equal(t.percentagemChegadas, 0);
});

test('os totais batem com o Excel de 28/06/2026', () => {
  // 63 camisolas, 600 EUR ao fornecedor, 825 EUR aos clientes, 225 EUR de lucro.
  // A caixa "Valores" do ficheiro dizia 829 de total, e estava errada.
  const linhas = [];
  for (let i = 0; i < 63; i += 1) linhas.push(linha({ id: i + 1 }));
  const t = calcularTotais(linhas);
  assert.equal(t.nCamisolas, 63);
  assert.equal(t.totalFornecedor, 63000);
  assert.equal(t.totalCliente, 88200);
  assert.equal(t.lucro, t.totalCliente - t.totalFornecedor);
});

test('o lucro medio arredonda ao centimo em vez de arrastar decimais', () => {
  const t = calcularTotais([
    linha({ id: 1, preco_fornecedor: 700, preco_cliente: 1100 }),
    linha({ id: 2, preco_fornecedor: 1000, preco_cliente: 1300 }),
    linha({ id: 3, preco_fornecedor: 1000, preco_cliente: 1000 })
  ]);
  assert.equal(t.lucro, 700);
  assert.equal(t.lucroMedio, 233); // 700/3 = 233,33
  assert.ok(Number.isInteger(t.lucroMedio));
});

test('conta cada estado de chegada e a percentagem', () => {
  const t = calcularTotais([
    linha({ id: 1, estado_chegada: 'chegou' }),
    linha({ id: 2, estado_chegada: 'chegou' }),
    linha({ id: 3, estado_chegada: 'em_falta' }),
    linha({ id: 4, estado_chegada: 'errada' }),
    linha({ id: 5, estado_chegada: 'pendente' })
  ]);
  assert.equal(t.chegaram, 2);
  assert.equal(t.emFalta, 1);
  assert.equal(t.erradas, 1);
  assert.equal(t.pendentes, 1);
  assert.equal(t.percentagemChegadas, 40);
});

test('recebido e por receber olham para o pago, nao para a chegada', () => {
  const t = calcularTotais([
    linha({ id: 1, pago: true, preco_cliente: 1400, estado_chegada: 'pendente' }),
    linha({ id: 2, pago: false, preco_cliente: 1100, estado_chegada: 'chegou' })
  ]);
  assert.equal(t.nPagas, 1);
  assert.equal(t.recebido, 1400);
  assert.equal(t.porReceber, 1100);
});

test('contarPorTamanho ordena pelo mais frequente', () => {
  const r = contarPorTamanho([
    linha({ tamanho: 'L' }), linha({ tamanho: 'L' }), linha({ tamanho: 'M' }),
    linha({ tamanho: '26' }), linha({ tamanho: null })
  ]);
  assert.deepEqual(r[0], { tamanho: 'L', total: 2 });
  assert.equal(r.length, 4);
  assert.ok(r.some((x) => x.tamanho === '26'), 'tamanhos de crianca contam como qualquer outro');
  assert.ok(r.some((x) => x.tamanho === '—'), 'sem tamanho tem a sua propria linha');
});

test('agruparPorCliente mantem a ordem de chegada dos clientes', () => {
  const g = agruparPorCliente([
    linha({ id: 1, cliente_id: 7, cliente_nome: 'Tiago', posicao: 1 }),
    linha({ id: 2, cliente_id: 3, cliente_nome: 'Vitorino', posicao: 2 }),
    linha({ id: 3, cliente_id: 7, cliente_nome: 'Tiago', posicao: 3 })
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].cliente_nome, 'Tiago');
  assert.equal(g[0].linhas.length, 2);
  assert.equal(g[1].cliente_nome, 'Vitorino');
  assert.equal(g[0].totais.nCamisolas, 2);
});

test('dentro de cada cliente as linhas seguem a posicao', () => {
  const g = agruparPorCliente([
    linha({ id: 9, cliente_id: 1, posicao: 5 }),
    linha({ id: 2, cliente_id: 1, posicao: 1 })
  ]);
  assert.deepEqual(g[0].linhas.map((l) => l.id), [2, 9]);
});
