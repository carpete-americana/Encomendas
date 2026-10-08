'use strict';

/** A imagem que se manda ao cliente: o preco dele, e nunca o do fornecedor. */

const test = require('node:test');
const assert = require('node:assert');
const { htmlCliente, linhasParaCliente } = require('../src/main/servicos/imagem-cliente');

function linha(dados) {
  return {
    camisola_nome: 'Portugal 2026', tamanho: 'L', personalizacao: false, personalizacao_texto: null,
    preco_fornecedor: 1234, preco_cliente: 1700, estado_chegada: 'pendente', pago: false, camisola_foto: null,
    ...dados
  };
}

const ENCOMENDA = { data: '2026-06-28' };
const grupo = (linhas) => ({ cliente_id: 1, cliente_nome: 'JOÃO SOUSA', linhas });

test('leva o preco ao cliente e o total, nunca o preco do fornecedor', () => {
  const html = htmlCliente(grupo([
    linha({ preco_fornecedor: 1234, preco_cliente: 1700 }),
    linha({ preco_fornecedor: 987, preco_cliente: 1400 })
  ]), ENCOMENDA);

  assert.match(html, /17,00 €/);
  assert.match(html, /14,00 €/);
  assert.match(html, /31,00 €/, 'o total');
  assert.doesNotMatch(html, /12,34/, 'o preco do fornecedor nao sai');
  assert.doesNotMatch(html, /9,87/);
  assert.doesNotMatch(html, /22,21/, 'nem o total do fornecedor');
});

test('uma camisola que vai de volta nao aparece nem e cobrada', () => {
  const g = grupo([
    linha({ camisola_nome: 'Fica', preco_cliente: 1700 }),
    linha({ camisola_nome: 'Vai de volta', preco_cliente: 1500, estado_chegada: 'em_falta' })
  ]);
  assert.equal(linhasParaCliente(g).length, 1);

  const html = htmlCliente(g, ENCOMENDA);
  assert.doesNotMatch(html, /Vai de volta/);
  assert.doesNotMatch(html, /32,00 €/);
  assert.match(html, /1 camisola</);
});

test('com parte paga mostra o que falta pagar', () => {
  const html = htmlCliente(grupo([
    linha({ preco_cliente: 1700, pago: true }),
    linha({ preco_cliente: 1400 })
  ]), ENCOMENDA);
  assert.match(html, /Falta pagar/);
  assert.match(html, /já pagaste 17,00 €/);
  assert.match(html, /14,00 €<\/div>\s*<\/section>/, 'o numero grande e o que falta');
});

test('mostra a estampagem e o tamanho, e escapa o que foi escrito a mao', () => {
  const html = htmlCliente(grupo([
    linha({ personalizacao: true, personalizacao_texto: 'Ronaldo - 7 - <b>Badge</b>', tamanho: 'XL' })
  ]), ENCOMENDA);
  assert.match(html, /class="n">Ronaldo</);
  assert.match(html, /class="num">7</);
  assert.match(html, /&lt;b&gt;Badge&lt;\/b&gt;/);
  assert.match(html, />XL</);
  assert.match(html, /João Sousa/, 'o nome em maiusculas passa a nome proprio');
});
