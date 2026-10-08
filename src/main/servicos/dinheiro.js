'use strict';

/**
 * Todo o dinheiro desta app vive em centimos inteiros. Virgula flutuante em
 * euros da somas como 34.9499999 e faz um total fechado parecer por fechar.
 */

/** Aceita numero, "12", "12,50", "12.50", "12,5 EUR". Devolve centimos ou null. */
function paraCentimos(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    return Math.round(valor * 100);
  }
  const limpo = String(valor)
    .replace(/[^\d,.\-]/g, '')
    .replace(',', '.');
  if (limpo === '' || limpo === '-' || limpo === '.') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function deCentimos(centimos) {
  if (centimos === null || centimos === undefined) return null;
  return centimos / 100;
}

function formatar(centimos, moeda = '€') {
  if (centimos === null || centimos === undefined) return '—';
  const negativo = centimos < 0;
  const abs = Math.abs(centimos);
  const texto = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return `${negativo ? '-' : ''}${texto} ${moeda}`;
}

function somar(lista) {
  return lista.reduce((t, c) => t + (c || 0), 0);
}

module.exports = { paraCentimos, deCentimos, formatar, somar };
