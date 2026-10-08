'use strict';

/**
 * A margem desce em cascata: a linha manda sobre o cliente, e o cliente manda
 * sobre a definicao. Vem dos dados reais do Excel de 28/06/2026, onde a margem
 * e +4 EUR quase sempre, +3 e +2 nalgumas linhas, e 0 para mim e para a
 * Gabriel/Sara. Uma margem unica obrigava a corrigir tudo a mao.
 */

/** Devolve a margem em centimos a aplicar a uma linha. */
function margemAplicavel({ margemPadrao = 0, margemCliente = null, margemLinha = null } = {}) {
  if (margemLinha !== null && margemLinha !== undefined) return margemLinha;
  if (margemCliente !== null && margemCliente !== undefined) return margemCliente;
  return margemPadrao || 0;
}

/**
 * Preco a cobrar ao cliente. Preco de fornecedor desconhecido devolve null e
 * nao zero: zero seria uma camisola oferecida, e isso e uma decisao, nao um
 * dado em falta.
 */
function precoClienteSugerido({ precoFornecedor, margem }) {
  if (precoFornecedor === null || precoFornecedor === undefined) return null;
  return precoFornecedor + (margem || 0);
}

/**
 * Le "Ronaldo - 7 - Badge Mundial" e diz o que la esta: um nome, um numero, ou
 * os dois. O que sobra (emblemas) nao conta para o preco da estampagem.
 */
function analisarEstampagem(texto) {
  const partes = String(texto || '').split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const temNumero = partes.some((p) => /^\d{1,3}$/.test(p));
  const temNome = partes.some((p) => /\p{L}/u.test(p) && !/^\d+$/.test(p));
  return { temNome, temNumero };
}

/**
 * Quanto o fornecedor cobra a mais para estampar. Nome e numero custam mais do
 * que so um dos dois; sem personalizacao nao custa nada.
 */
function custoEstampagem(texto, { personalizacao = true, nomeNumero = 0, soUm = 0 } = {}) {
  if (!personalizacao) return 0;
  const { temNome, temNumero } = analisarEstampagem(texto);
  if (temNome && temNumero) return nomeNumero;
  if (temNome || temNumero) return soUm;
  // Marcada como personalizada mas sem nada escrito ainda: cobra-se o caso
  // mais comum, e o valor acerta-se sozinho quando o texto for preenchido.
  return nomeNumero;
}

/** Margem efetiva de uma linha ja gravada (pode nao bater com nenhuma definicao). */
function margemDaLinha(linha) {
  return (linha.preco_cliente || 0) - (linha.preco_fornecedor || 0);
}

module.exports = { margemAplicavel, precoClienteSugerido, margemDaLinha, custoEstampagem, analisarEstampagem };
