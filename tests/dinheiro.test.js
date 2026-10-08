'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { paraCentimos, deCentimos, formatar, somar } = require('../src/main/servicos/dinheiro');

test('paraCentimos aceita as formas com que um preco e escrito', () => {
  assert.equal(paraCentimos(10), 1000);
  assert.equal(paraCentimos(12.5), 1250);
  assert.equal(paraCentimos('12,50'), 1250);
  assert.equal(paraCentimos('12.50'), 1250);
  assert.equal(paraCentimos('12,5 €'), 1250);
  assert.equal(paraCentimos(' 7 '), 700);
});

test('paraCentimos distingue vazio de zero', () => {
  assert.equal(paraCentimos(''), null);
  assert.equal(paraCentimos(null), null);
  assert.equal(paraCentimos(undefined), null);
  assert.equal(paraCentimos('-'), null);
  assert.equal(paraCentimos('abc'), null);
  assert.equal(paraCentimos(0), 0);
  assert.equal(paraCentimos('0'), 0);
});

test('o arredondamento nao deixa centimos pelo caminho', () => {
  // 150.67 - 115.72 em virgula flutuante da 34.94999...; em centimos da 3495.
  assert.equal(paraCentimos(150.67) - paraCentimos(115.72), 3495);
  assert.equal(paraCentimos(0.1) + paraCentimos(0.2), 30);
});

test('formatar escreve em portugues', () => {
  assert.equal(formatar(1250), '12,50 €');
  assert.equal(formatar(700), '7,00 €');
  assert.equal(formatar(5), '0,05 €');
  assert.equal(formatar(-400), '-4,00 €');
  assert.equal(formatar(0), '0,00 €');
  assert.equal(formatar(null), '—');
});

test('deCentimos e somar', () => {
  assert.equal(deCentimos(1250), 12.5);
  assert.equal(deCentimos(null), null);
  assert.equal(somar([100, 200, null, 300]), 600);
  assert.equal(somar([]), 0);
});
