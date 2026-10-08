'use strict';

const { calcularTotais } = require('./totais');

/**
 * Agrupa as linhas por cliente, mantendo a ordem em que os clientes aparecem
 * na encomenda. E a forma do Excel e a forma do ecra de detalhe: os dois leem
 * o mesmo agrupamento, por isso nao podem divergir.
 */
function agruparPorCliente(linhas) {
  const grupos = new Map();

  for (const linha of linhas) {
    const id = linha.cliente_id;
    if (!grupos.has(id)) {
      grupos.set(id, {
        cliente_id: id,
        cliente_nome: linha.cliente_nome,
        cliente_contacto: linha.cliente_contacto || null,
        linhas: []
      });
    }
    grupos.get(id).linhas.push(linha);
  }

  return [...grupos.values()].map((g) => ({
    ...g,
    linhas: [...g.linhas].sort((a, b) => a.posicao - b.posicao || a.id - b.id),
    totais: calcularTotais(g.linhas)
  }));
}

module.exports = { agruparPorCliente };
