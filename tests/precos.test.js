'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { margemAplicavel, precoClienteSugerido, margemDaLinha } = require('../src/main/servicos/precos');

test('a margem desce em cascata: linha > cliente > definicao', () => {
  assert.equal(margemAplicavel({ margemPadrao: 400 }), 400);
  assert.equal(margemAplicavel({ margemPadrao: 400, margemCliente: 200 }), 200);
  assert.equal(margemAplicavel({ margemPadrao: 400, margemCliente: 200, margemLinha: 0 }), 0);
  assert.equal(margemAplicavel({ margemPadrao: 400, margemLinha: 300 }), 300);
});

test('margem zero e uma escolha, nao a ausencia de escolha', () => {
  // O caso real: as camisolas do proprio e as da Gabriel/Sara sao ao custo.
  assert.equal(margemAplicavel({ margemPadrao: 400, margemCliente: 0 }), 0);
  assert.equal(margemAplicavel({ margemPadrao: 400, margemCliente: null }), 400);
  assert.equal(margemAplicavel({ margemPadrao: 400, margemCliente: undefined }), 400);
});

test('margem em falta em todo o lado vale zero', () => {
  assert.equal(margemAplicavel({}), 0);
  assert.equal(margemAplicavel(), 0);
});

test('o preco ao cliente e o do fornecedor mais a margem', () => {
  assert.equal(precoClienteSugerido({ precoFornecedor: 700, margem: 400 }), 1100);
  assert.equal(precoClienteSugerido({ precoFornecedor: 1000, margem: 400 }), 1400);
  assert.equal(precoClienteSugerido({ precoFornecedor: 1300, margem: 400 }), 1700);
  assert.equal(precoClienteSugerido({ precoFornecedor: 1200, margem: 400 }), 1600);
});

test('sem preco de fornecedor nao se inventa um preco', () => {
  assert.equal(precoClienteSugerido({ precoFornecedor: null, margem: 400 }), null);
  assert.equal(precoClienteSugerido({ precoFornecedor: undefined, margem: 400 }), null);
  // Zero e um preco valido (oferta), e tem de continuar a somar a margem.
  assert.equal(precoClienteSugerido({ precoFornecedor: 0, margem: 400 }), 400);
});

test('margemDaLinha le o que ficou gravado, nao o que a definicao diz hoje', () => {
  assert.equal(margemDaLinha({ preco_fornecedor: 1000, preco_cliente: 1400 }), 400);
  assert.equal(margemDaLinha({ preco_fornecedor: 1000, preco_cliente: 1000 }), 0);
  assert.equal(margemDaLinha({ preco_fornecedor: 1300, preco_cliente: 1500 }), 200);
});
