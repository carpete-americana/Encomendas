'use strict';

const { somar } = require('./dinheiro');

/**
 * As contas que no Excel viviam na caixa "Valores" escrita a mao. Sao sempre
 * calculadas: no ficheiro original o lucro gravado era 225 e a subtracao real
 * dava 229, e ninguem deu por isso.
 */
function calcularTotais(linhas) {
  const n = linhas.length;

  // Uma camisola "em falta" vai de volta: nao e vendida nem paga, por isso o
  // dinheiro dela sai das contas. Continua a contar como camisola da encomenda,
  // e o que ha a devolver fica a vista num numero proprio.
  const paraDevolver = linhas.filter((l) => l.estado_chegada === 'em_falta');
  const devolvidas = paraDevolver.filter((l) => l.devolvida).length;
  const contam = linhas.filter((l) => l.estado_chegada !== 'em_falta');

  const totalFornecedor = somar(contam.map((l) => l.preco_fornecedor));
  const totalCliente = somar(contam.map((l) => l.preco_cliente));
  const lucro = totalCliente - totalFornecedor;

  const chegaram = linhas.filter((l) => l.estado_chegada === 'chegou').length;
  // Entregar e outra coisa que chegar: so se entrega o que ja ca esta, e uma
  // camisola pode ficar ca semanas antes de ir para o dono.
  const entregues = linhas.filter((l) => l.entregue).length;
  const prontasParaEntregar = linhas.filter((l) => !l.entregue && l.estado_chegada === 'chegou').length;
  const emFalta = paraDevolver.length;
  const erradas = linhas.filter((l) => l.estado_chegada === 'errada').length;
  const pendentes = linhas.filter((l) => l.estado_chegada === 'pendente').length;

  const pagas = contam.filter((l) => l.pago);
  const porReceber = somar(contam.filter((l) => !l.pago).map((l) => l.preco_cliente));
  const nContam = contam.length;

  return {
    nCamisolas: n,
    totalFornecedor,
    totalCliente,
    lucro,
    lucroMedio: nContam ? Math.round(lucro / nContam) : 0,
    chegaram,
    entregues,
    prontasParaEntregar,
    // Uma camisola que vai de volta nao esta a espera de ser entregue.
    porEntregar: contam.filter((l) => !l.entregue).length,
    percentagemEntregues: n ? Math.round((entregues / n) * 100) : 0,
    emFalta,
    erradas,
    pendentes,
    percentagemChegadas: n ? Math.round((chegaram / n) * 100) : 0,
    nPagas: pagas.length,
    recebido: somar(pagas.map((l) => l.preco_cliente)),
    porReceber,
    // O que esta para devolver, e o dinheiro que anda com isso.
    paraDevolver: emFalta,
    devolvidas,
    porDevolver: emFalta - devolvidas,
    devolverAoFornecedor: somar(paraDevolver.map((l) => l.preco_fornecedor)),
    naoCobradoAoCliente: somar(paraDevolver.map((l) => l.preco_cliente)),
    aReembolsar: somar(paraDevolver.filter((l) => l.pago).map((l) => l.preco_cliente))
  };
}

/** Quantas camisolas de cada tamanho, para conferir a encomenda de relance. */
function contarPorTamanho(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const t = (l.tamanho || '—').trim() || '—';
    mapa.set(t, (mapa.get(t) || 0) + 1);
  }
  return [...mapa.entries()]
    .map(([tamanho, total]) => ({ tamanho, total }))
    .sort((a, b) => b.total - a.total || a.tamanho.localeCompare(b.tamanho));
}

module.exports = { calcularTotais, contarPorTamanho };
