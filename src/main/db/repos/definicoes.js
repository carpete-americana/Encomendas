'use strict';

const { base } = require('../index');
const { paraCentimos } = require('../../servicos/dinheiro');

function todas() {
  return base().all('SELECT chave, valor, tipo, descricao FROM definicoes ORDER BY chave');
}

/** Devolve as definicoes como objeto, ja convertidas pelo tipo declarado. */
function mapa() {
  const out = {};
  for (const d of todas()) {
    if (d.tipo === 'numero' || d.tipo === 'dinheiro') out[d.chave] = Number(d.valor) || 0;
    else if (d.tipo === 'booleano') out[d.chave] = d.valor === 'true' || d.valor === '1';
    else out[d.chave] = d.valor;
  }
  return out;
}

function ler(chave, porOmissao = null) {
  const l = base().get('SELECT valor, tipo FROM definicoes WHERE chave = ?', [chave]);
  if (!l) return porOmissao;
  if (l.tipo === 'numero' || l.tipo === 'dinheiro') return Number(l.valor) || 0;
  if (l.tipo === 'booleano') return l.valor === 'true' || l.valor === '1';
  return l.valor;
}

function gravar(chave, valor) {
  const atual = base().get('SELECT tipo FROM definicoes WHERE chave = ?', [chave]);
  let texto = valor;
  if (atual && atual.tipo === 'dinheiro') texto = String(paraCentimos(valor) ?? 0);
  else if (typeof valor === 'boolean') texto = valor ? 'true' : 'false';
  else texto = String(valor ?? '');

  base().run(
    'INSERT INTO definicoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    [chave, texto]
  );
  return ler(chave);
}

function gravarVarias(objeto) {
  for (const [chave, valor] of Object.entries(objeto)) gravar(chave, valor);
  return mapa();
}

/** Lista de tamanhos sugeridos, ja partida e limpa. */
function tamanhos() {
  return String(ler('tamanhos', ''))
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

module.exports = { todas, mapa, ler, gravar, gravarVarias, tamanhos };
