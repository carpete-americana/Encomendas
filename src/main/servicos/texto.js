'use strict';

/**
 * Chave de comparacao: sem acentos, sem maiusculas, sem espacos a mais.
 * E o que impede "Portugal  2026" e "portugal 2026" de virarem duas camisolas
 * distintas no catalogo. Mantem-se deliberadamente burra: "Portugal 2026" e
 * "Portugal 2026 Home Kit" SAO camisolas diferentes e tem de continuar a ser.
 */
function chave(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Limpa o que vem de uma celula: Enters, espacos das pontas, tracos soltos. */
function limpar(valor) {
  if (valor === null || valor === undefined) return '';
  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '-' || t === '—' ? '' : t;
}

/** Nome de ficheiro seguro a partir de um titulo. */
function nomeFicheiro(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

module.exports = { chave, limpar, nomeFicheiro };
