'use strict';

/** A estampagem e um extra que o fornecedor cobra por cima do preco da camisola. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { custoEstampagem, analisarEstampagem } = require('../src/main/servicos/precos');
const db = require('../src/main/db');
const camisolas = require('../src/main/db/repos/camisolas');
const clientes = require('../src/main/db/repos/clientes');
const encomendas = require('../src/main/db/repos/encomendas');

const PRECOS = { nomeNumero: 300, soUm: 200 };

// ------------------------------------------------------------------- leitura

test('le o que esta escrito na estampagem', () => {
  assert.deepEqual(analisarEstampagem('Ronaldo - 7'), { temNome: true, temNumero: true });
  assert.deepEqual(analisarEstampagem('Ronaldo'), { temNome: true, temNumero: false });
  assert.deepEqual(analisarEstampagem('7'), { temNome: false, temNumero: true });
  assert.deepEqual(analisarEstampagem(''), { temNome: false, temNumero: false });
});

test('um emblema nao e nome nem numero, mas nao estraga a leitura', () => {
  // "Ronaldo - 7 - Badge Mundial" continua a ser nome e numero.
  assert.deepEqual(analisarEstampagem('Ronaldo - 7 - Badge Mundial'), { temNome: true, temNumero: true });
});

// -------------------------------------------------------------------- precos

test('nome e numero custam mais do que so um deles', () => {
  assert.equal(custoEstampagem('Ronaldo - 7', PRECOS), 300);
  assert.equal(custoEstampagem('Messi - 10 - Champions', PRECOS), 300);
  assert.equal(custoEstampagem('Ronaldo', PRECOS), 200);
  assert.equal(custoEstampagem('7', PRECOS), 200);
});

test('sem personalizacao nao se cobra estampagem nenhuma', () => {
  assert.equal(custoEstampagem('Ronaldo - 7', { ...PRECOS, personalizacao: false }), 0);
  assert.equal(custoEstampagem('', { ...PRECOS, personalizacao: false }), 0);
});

test('marcada como personalizada mas ainda por escrever conta como nome e numero', () => {
  // E o caso mais comum; o valor acerta-se sozinho quando o texto for escrito.
  assert.equal(custoEstampagem('', PRECOS), 300);
});

// ----------------------------------------------------------- na base de dados

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-estampagem-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

function linhaNova(dados) {
  const e = encomendas.criar({ data: '2026-09-22' });
  const cliente = clientes.criarOuObter({ nome: `Cliente ${e.id}` });
  camisolas.criarOuObter({ nome: 'Kit base', preco_fornecedor: 1000 });
  const id = encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_nome: 'Kit base', ...dados });
  return { e, id, linha: encomendas.linhasDe(e.id).find((l) => l.id === id) };
}

test('a estampagem entra no preco de fornecedor da linha', () => {
  const { linha } = linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });
  assert.equal(linha.preco_fornecedor, 1300, '10,00 da camisola + 3,00 da estampagem');
  assert.equal(linha.preco_cliente, 1700, 'e a margem de 4,00 por cima');
});

test('so nome ou so numero custa menos', () => {
  assert.equal(linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo' }).linha.preco_fornecedor, 1200);
  assert.equal(linhaNova({ personalizacao: true, personalizacao_texto: '7' }).linha.preco_fornecedor, 1200);
});

test('sem personalizacao a camisola custa o que custa', () => {
  const { linha } = linhaNova({});
  assert.equal(linha.preco_fornecedor, 1000);
  assert.equal(linha.preco_cliente, 1400);
});

test('o catalogo guarda a camisola lisa, sem a estampagem', () => {
  linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });
  assert.equal(camisolas.porChave('Kit base').preco_fornecedor, 1000,
    'senao a estampagem de uma encomenda encarecia a camisola para sempre');
});

test('ligar a personalizacao numa linha ja escrita soma o extra dos dois lados', () => {
  const { id } = linhaNova({});
  encomendas.atualizarLinha(id, { personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });

  const l = encomendas.linhasDe(encomendas.listar()[0].id).find((x) => x.id === id);
  assert.equal(l.preco_fornecedor, 1300);
  assert.equal(l.preco_cliente, 1700, 'a margem nao se perde pelo caminho');
});

test('desligar a personalizacao devolve o preco ao que era', () => {
  const { e, id } = linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });
  encomendas.atualizarLinha(id, { personalizacao: false });

  const l = encomendas.linhasDe(e.id).find((x) => x.id === id);
  assert.equal(l.preco_fornecedor, 1000);
  assert.equal(l.preco_cliente, 1400);
});

test('tirar o numero baixa de nome-e-numero para so nome', () => {
  const { e, id } = linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });
  encomendas.atualizarLinha(id, { personalizacao_texto: 'Ronaldo' });

  const l = encomendas.linhasDe(e.id).find((x) => x.id === id);
  assert.equal(l.preco_fornecedor, 1200, '3,00 passaram a 2,00');
});

test('um preco escrito a mao manda sobre a regra', () => {
  const { e, id } = linhaNova({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7' });
  encomendas.atualizarLinha(id, { preco_fornecedor: 5000, personalizacao_texto: 'Messi' });

  const l = encomendas.linhasDe(e.id).find((x) => x.id === id);
  assert.equal(l.preco_fornecedor, 5000, 'o que foi escrito fica escrito');
});

test('os precos importados de um Excel antigo nao levam a estampagem outra vez', () => {
  // No ficheiro antigo os 13,00 da Argentina ja incluiam os 3,00 da estampagem.
  const { linha } = linhaNova({
    personalizacao: true,
    personalizacao_texto: 'Messi - 10',
    preco_fornecedor: 1300,
    preco_cliente: 1700,
    precos_finais: true
  });
  assert.equal(linha.preco_fornecedor, 1300);
  assert.equal(linha.preco_cliente, 1700);
});
