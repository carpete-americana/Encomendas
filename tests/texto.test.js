'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chave, limpar, nomeFicheiro } = require('../src/main/servicos/texto');

test('a chave junta o que e a mesma camisola escrita de outra maneira', () => {
  assert.equal(chave('Portugal 2026'), chave('portugal 2026'));
  assert.equal(chave('Portugal  2026'), chave('Portugal 2026'));
  assert.equal(chave(' Portugal 2026 '), chave('Portugal 2026'));
  assert.equal(chave('Itália principal'), chave('Italia principal'));
});

test('a chave NAO junta camisolas que sao mesmo diferentes', () => {
  // Os tres existem lado a lado no Excel real e sao artigos distintos.
  assert.notEqual(chave('Portugal 2026'), chave('Portugal 2026 Home Kit'));
  assert.notEqual(chave('Portugal 2026'), chave('Portugal principal 2026'));
  assert.notEqual(chave('Sporting 2000/01'), chave('Sporting 2000/01 third kit'));
});

test('limpar trata o traco como campo vazio', () => {
  assert.equal(limpar('-'), '');
  assert.equal(limpar('—'), '');
  assert.equal(limpar('  Ronaldo - 7  '), 'Ronaldo - 7');
  // Havia um nome gravado com Enter no fim, que metia uma linha em branco.
  assert.equal(limpar('Andre Matias\r\n'), 'Andre Matias');
  assert.equal(limpar(null), '');
});

test('nomeFicheiro tira acentos e o que o Windows nao aceita', () => {
  assert.equal(nomeFicheiro('ENCOMENDA 28/06/2026'), 'ENCOMENDA_28062026');
  assert.equal(nomeFicheiro('Encomenda do André'), 'Encomenda_do_Andre');
  assert.ok(!nomeFicheiro('a/b\\c:d*e?f"g<h>i|j').match(/[/\\:*?"<>|]/));
});
