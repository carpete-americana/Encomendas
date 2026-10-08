'use strict';

/** Comportamento da base: catalogo que cresce, precos congelados, cascatas. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../src/main/db');
const camisolas = require('../src/main/db/repos/camisolas');
const clientes = require('../src/main/db/repos/clientes');
const encomendas = require('../src/main/db/repos/encomendas');
const definicoes = require('../src/main/db/repos/definicoes');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-base-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('as definicoes nascem com os valores de partida', () => {
  assert.equal(definicoes.ler('margem_padrao'), 400);
  assert.deepEqual(definicoes.tamanhos().slice(0, 5), ['S', 'M', 'L', 'XL', 'XXL']);
});

test('uma definicao de dinheiro e gravada em euros e lida em centimos', () => {
  definicoes.gravar('margem_padrao', '4,50');
  assert.equal(definicoes.ler('margem_padrao'), 450);
  definicoes.gravar('margem_padrao', '4');
  assert.equal(definicoes.ler('margem_padrao'), 400);
});

test('escrever a mesma camisola devolve a que ja existe', () => {
  const a = camisolas.criarOuObter({ nome: 'Portugal 2026', preco_fornecedor: 1000 });
  const b = camisolas.criarOuObter({ nome: '  portugal  2026 ' });
  assert.equal(a.id, b.id);

  const c = camisolas.criarOuObter({ nome: 'Portugal 2026 Home Kit' });
  assert.notEqual(a.id, c.id, 'nomes diferentes sao camisolas diferentes');
});

test('reencontrar uma camisola preenche o que lhe faltava sem apagar o resto', () => {
  const a = camisolas.criarOuObter({ nome: 'Benfica 2024/25' });
  assert.equal(a.preco_fornecedor, null);

  const b = camisolas.criarOuObter({ nome: 'Benfica 2024/25', preco_fornecedor: 1300, foto: 'x.jpg' });
  assert.equal(b.id, a.id);
  assert.equal(b.preco_fornecedor, 1300);
  assert.equal(b.foto, 'x.jpg');

  const c = camisolas.criarOuObter({ nome: 'Benfica 2024/25', preco_fornecedor: 9900, foto: 'y.jpg' });
  assert.equal(c.preco_fornecedor, 1300, 'o preco que ja la estava nao e substituido');
  assert.equal(c.foto, 'x.jpg');
});

test('a linha nova herda o preco do catalogo e a margem por omissao', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Tiago Bastos' });
  const id = encomendas.adicionarLinha(e.id, {
    cliente_id: cliente.id, camisola_nome: 'Portugal 2026', tamanho: 'L'
  });

  const linha = encomendas.linhasDe(e.id).find((l) => l.id === id);
  assert.equal(linha.preco_fornecedor, 1000);
  assert.equal(linha.preco_cliente, 1400); // 1000 + margem de 400
});

test('a margem do cliente manda sobre a definicao', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Gabriel / Sara', margem_override: 0 });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Portugal 2026' });

  const linha = encomendas.linhasDe(e.id)[0];
  assert.equal(linha.preco_cliente, 1000, 'ao custo, sem margem nenhuma');
});

test('o preco da linha congela: mexer no catalogo nao reescreve o passado', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Vitorino' });
  const camisola = camisolas.criarOuObter({ nome: 'Celtic 1984', preco_fornecedor: 1000 });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_id: camisola.id });

  camisolas.atualizar(camisola.id, { preco_fornecedor: 5000 });

  const linha = encomendas.linhasDe(e.id)[0];
  assert.equal(linha.preco_fornecedor, 1000, 'a encomenda antiga custou o que custou');
});

test('duplicar uma linha copia os dados e limpa o que e do exemplar', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Joao Sousa' });
  const id = encomendas.adicionarLinha(e.id, {
    cliente_id: cliente.id, camisola_nome: 'Japao 1998', tamanho: 'L',
    personalizacao: true, personalizacao_texto: 'Honda - 4'
  });
  encomendas.atualizarLinha(id, { estado_chegada: 'chegou', pago: true });

  const novaId = encomendas.duplicarLinha(id);
  const nova = encomendas.linhasDe(e.id).find((l) => l.id === novaId);

  assert.equal(nova.camisola_nome, 'Japao 1998');
  assert.equal(nova.personalizacao_texto, 'Honda - 4');
  assert.equal(nova.estado_chegada, 'pendente', 'a copia ainda nao chegou');
  assert.equal(nova.pago, false, 'e ainda nao foi paga');
});

test('marcarBloco so toca no cliente indicado', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const a = clientes.criarOuObter({ nome: 'Cliente A' });
  const b = clientes.criarOuObter({ nome: 'Cliente B' });
  encomendas.adicionarLinha(e.id, { cliente_id: a.id, camisola_nome: 'Kit A1' });
  encomendas.adicionarLinha(e.id, { cliente_id: a.id, camisola_nome: 'Kit A2' });
  encomendas.adicionarLinha(e.id, { cliente_id: b.id, camisola_nome: 'Kit B1' });

  assert.equal(encomendas.marcarBloco(e.id, a.id, { estado_chegada: 'chegou' }), 2);

  const linhas = encomendas.linhasDe(e.id);
  assert.equal(linhas.filter((l) => l.estado_chegada === 'chegou').length, 2);
  assert.equal(linhas.find((l) => l.cliente_id === b.id).estado_chegada, 'pendente');
});

test('apagar a encomenda leva as linhas e deixa o catalogo em paz', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Efemero' });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Kit efemero' });

  encomendas.apagar(e.id);

  assert.equal(encomendas.porId(e.id), null);
  assert.ok(camisolas.porChave('Kit efemero'), 'a camisola fica no catalogo');
  assert.ok(clientes.porChave('Efemero'), 'o cliente fica');
});

test('uma camisola que esta numa encomenda nao pode ser apagada', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  const cliente = clientes.criarOuObter({ nome: 'Alguem' });
  const camisola = camisolas.criarOuObter({ nome: 'Kit protegido' });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_id: camisola.id });

  assert.throws(() => camisolas.apagar(camisola.id), /linha/);
  assert.throws(() => clientes.apagar(cliente.id), /encomendas/);
});

test('um estado desconhecido e recusado em vez de gravado', () => {
  const e = encomendas.criar({ data: '2026-09-20' });
  assert.throws(() => encomendas.atualizar(e.id, { estado: 'inventado' }), /Estado desconhecido/);

  const cliente = clientes.criarOuObter({ nome: 'X' });
  const id = encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Kit X' });
  assert.throws(() => encomendas.atualizarLinha(id, { estado_chegada: 'talvez' }), /Estado de chegada/);
});

test('o historico do cliente soma o que ele ja gastou e o que falta pagar', () => {
  const e = encomendas.criar({ data: '2026-09-21' });
  const cliente = clientes.criarOuObter({ nome: 'Pagador' });
  const a = encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Kit P1', preco_fornecedor: 1000 });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Kit P2', preco_fornecedor: 1000 });
  encomendas.atualizarLinha(a, { pago: true });

  const c = clientes.porId(cliente.id);
  assert.equal(c.total_camisolas, 2);
  assert.equal(c.total_gasto, 2800);
  assert.equal(c.por_receber, 1400);
});
