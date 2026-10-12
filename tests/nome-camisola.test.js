'use strict';

/** A camisola define-se por equipa, epoca e equipamento; o nome sai dai. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { nomeDe, emFalta, decompor } = require('../src/main/servicos/nome-camisola');
const db = require('../src/main/db');
const { MIGRACOES } = require('../src/main/db/migracoes');
const camisolas = require('../src/main/db/repos/camisolas');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-nome-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('o nome sai dos campos, sempre da mesma maneira', () => {
  assert.equal(nomeDe({ equipa: 'Portugal', epoca: '2026', tipo: 'principal' }), 'Portugal 2026 Home Kit');
  assert.equal(
    nomeDe({ equipa: ' Benfica ', epoca: '2025/26', tipo: 'alternativo', versao: 'jogador', detalhe: 'Manga comprida' }),
    'Benfica 2025/26 Away Kit Player Version - Manga comprida'
  );
  assert.equal(nomeDe({ equipa: 'Porto', epoca: '2024/25', tipo: 'guarda_redes' }), 'Porto 2024/25 Goalkeeper Kit');
});

test('sem equipa, epoca ou equipamento nao ha nome', () => {
  assert.equal(emFalta({ epoca: '2026', tipo: 'principal' }), 'a equipa');
  assert.equal(emFalta({ equipa: 'Portugal', tipo: 'principal' }), 'a época');
  assert.equal(emFalta({ equipa: 'Portugal', epoca: '2026', tipo: 'inventado' }), 'o equipamento');
  assert.equal(emFalta({ equipa: 'Portugal', epoca: '2026', tipo: 'terceiro' }), null);
});

test('le os campos nos nomes antigos', () => {
  assert.deepEqual(decompor('Portugal 2026 Home Kit'),
    { equipa: 'Portugal', epoca: '2026', tipo: 'principal', versao: null, detalhe: null });
  assert.deepEqual(decompor('Portugal principal 2026'),
    { equipa: 'Portugal', epoca: '2026', tipo: 'principal', versao: null, detalhe: null });
  assert.deepEqual(decompor('Real Madrid 2025-26 Away Kit Player Version'),
    { equipa: 'Real Madrid', epoca: '2025/26', tipo: 'alternativo', versao: 'jogador', detalhe: null });
  assert.deepEqual(decompor('Benfica 2024/2025 third manga comprida'),
    { equipa: 'Benfica', epoca: '2024/25', tipo: 'terceiro', versao: null, detalhe: 'manga comprida' });
  assert.deepEqual(decompor('Portugal 2026'),
    { equipa: 'Portugal', epoca: '2026', tipo: null, versao: null, detalhe: null });
});

test('sem ano ou sem equipa nao adivinha nada', () => {
  assert.equal(decompor('Kit sozinho'), null);
  assert.equal(decompor('2026 Home Kit'), null);
});

test('criar pelos campos gera o nome e recusa uma repetida', () => {
  const c = camisolas.criarPorCampos({ equipa: 'Sporting', epoca: '2025/26', tipo: 'principal', preco_fornecedor: 1200 });
  assert.equal(c.nome, 'Sporting 2025/26 Home Kit');
  assert.equal(c.tipo, 'principal');
  assert.equal(c.preco_fornecedor, 1200);

  assert.throws(() => camisolas.criarPorCampos({ equipa: 'sporting', epoca: '2025/26', tipo: 'principal' }), /Já existe/);
  assert.throws(() => camisolas.criarPorCampos({ equipa: 'Sporting', tipo: 'principal' }), /Falta escolher a época/);
});

test('mudar o equipamento refaz o nome', () => {
  const c = camisolas.criarPorCampos({ equipa: 'Braga', epoca: '2025/26', tipo: 'principal' });
  const depois = camisolas.atualizar(c.id, { tipo: 'alternativo', versao: 'adepto' });
  assert.equal(depois.nome, 'Braga 2025/26 Away Kit Fan Version');
  assert.equal(camisolas.porChave('Braga 2025/26 Away Kit Fan Version').id, c.id);

  // Mudar so a foto ou o preco nao toca no nome.
  assert.equal(camisolas.atualizar(c.id, { preco_fornecedor: 900 }).nome, 'Braga 2025/26 Away Kit Fan Version');
});

test('mudar os campos para os de outra camisola e recusado', () => {
  camisolas.criarPorCampos({ equipa: 'Vitoria', epoca: '2026', tipo: 'principal' });
  const b = camisolas.criarPorCampos({ equipa: 'Vitoria', epoca: '2026', tipo: 'alternativo' });
  assert.throws(() => camisolas.atualizar(b.id, { tipo: 'principal' }), /Juntar/);
});

test('um nome escrito fica como esta, mas a equipa vai para a lista', () => {
  const c = camisolas.criarOuObter({ nome: 'Brasil principal 2026' });
  assert.equal(c.nome, 'Brasil principal 2026');
  assert.equal(c.equipa, 'Brasil');
  assert.equal(c.tipo, 'principal');

  const equipas = camisolas.equipas().map((e) => e.nome);
  assert.ok(equipas.includes('Brasil'));
  assert.ok(equipas.includes('Sporting'));
  assert.ok(camisolas.epocas().includes('2025/26'));
  assert.ok(camisolas.listar({ equipa: 'brasil' }).every((x) => x.equipa === 'Brasil'));
});

test('a migracao preenche as camisolas antigas sem lhes mudar o nome', () => {
  const base = db.base();
  base.run(
    `INSERT INTO camisolas (nome, chave, criada_em) VALUES ('Italia 2006 Home Kit Retro', 'italia 2006 home kit retro', '2026-01-01'),
                                                         ('Coisa sem ano', 'coisa sem ano', '2026-01-01')`
  );
  MIGRACOES.find((m) => m.versao === 4).depois(base);

  const italia = camisolas.porChave('Italia 2006 Home Kit Retro');
  assert.equal(italia.nome, 'Italia 2006 Home Kit Retro');
  assert.deepEqual([italia.equipa, italia.epoca, italia.tipo, italia.versao], ['Italia', '2006', 'principal', 'retro']);

  const coisa = camisolas.porChave('Coisa sem ano');
  assert.equal(coisa.equipa, null);
  assert.equal(coisa.tipo, null);
});
