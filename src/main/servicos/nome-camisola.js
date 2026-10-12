'use strict';

const { limpar } = require('./texto');

/**
 * Uma camisola define-se por equipa, epoca e equipamento (mais a versao e um
 * detalhe, se houver). O nome deixa de ser escrito a mao: sai destes campos,
 * sempre da mesma maneira, e e esse que vai no Excel para o fornecedor. Por
 * isso fica em ingles, como os fornecedores os escrevem ("Home Kit").
 */
const TIPOS = [
  { valor: 'principal', rotulo: 'Principal (Home)', nome: 'Home Kit' },
  { valor: 'alternativo', rotulo: 'Alternativo (Away)', nome: 'Away Kit' },
  { valor: 'terceiro', rotulo: 'Terceiro (Third)', nome: 'Third Kit' },
  { valor: 'guarda_redes', rotulo: 'Guarda-redes (GK)', nome: 'Goalkeeper Kit' },
  { valor: 'especial', rotulo: 'Especial', nome: 'Special Kit' },
  { valor: 'treino', rotulo: 'Treino', nome: 'Training Kit' }
];

const VERSOES = [
  { valor: 'adepto', rotulo: 'Adepto (Fan)', nome: 'Fan Version' },
  { valor: 'jogador', rotulo: 'Jogador (Player)', nome: 'Player Version' },
  { valor: 'retro', rotulo: 'Retro', nome: 'Retro' }
];

/** "Benfica 2025/26 Away Kit Player Version - Manga comprida" */
function nomeDe({ equipa, epoca, tipo, versao, detalhe } = {}) {
  const t = TIPOS.find((x) => x.valor === tipo);
  const v = VERSOES.find((x) => x.valor === versao);
  const base = [limpar(equipa), limpar(epoca), t ? t.nome : '', v ? v.nome : ''].filter(Boolean).join(' ');
  const extra = limpar(detalhe);
  return extra ? `${base} - ${extra}` : base;
}

/** O que falta para o nome poder ser gerado, ou null se esta tudo. */
function emFalta({ equipa, epoca, tipo } = {}) {
  if (!limpar(equipa)) return 'a equipa';
  if (!limpar(epoca)) return 'a época';
  if (!TIPOS.some((x) => x.valor === tipo)) return 'o equipamento';
  return null;
}

// Palavras que os nomes antigos usavam para cada coisa, em portugues e ingles.
const PISTAS_TIPO = [
  ['guarda_redes', /\b(gk|goalkeeper|guarda[- ]?redes)\b/i],
  ['terceiro', /\b(third|3rd|terceir[oa])\b/i],
  ['alternativo', /\b(away|alternativ[oa]|fora|secundari[oa])\b/i],
  ['principal', /\b(home|principal|casa)\b/i],
  ['treino', /\b(training|treino)\b/i],
  ['especial', /\b(special|especial)\b/i]
];
const PISTAS_VERSAO = [
  ['jogador', /\b(player(\s+version)?|jogador)\b/i],
  ['adepto', /\b(fan(\s+version)?|adepto)\b/i],
  ['retro', /\b(retro|vintage)\b/i]
];
const EPOCA = /\b((?:19|20)\d{2})(?:\s*[/-]\s*(\d{2}|\d{4}))?\b/;

/**
 * Tenta ler os campos num nome antigo ("Portugal 2026 Home Kit"). So devolve
 * alguma coisa quando encontra pelo menos a equipa e o ano; o resto do nome
 * que nao percebeu fica no detalhe, para nada se perder.
 */
function decompor(nome) {
  let resto = ` ${limpar(nome)} `;
  const ano = resto.match(EPOCA);
  if (!ano) return null;

  const antes = resto.slice(0, ano.index);
  let depois = resto.slice(ano.index + ano[0].length);
  const epoca = ano[2] ? `${ano[1]}/${ano[2].slice(-2)}` : ano[1];

  let tipo = null;
  for (const [valor, re] of PISTAS_TIPO) {
    if (re.test(antes) || re.test(depois)) {
      tipo = valor;
      resto = antes.replace(re, ' ');
      depois = depois.replace(re, ' ');
      break;
    }
  }
  if (!tipo) resto = antes;

  let versao = null;
  for (const [valor, re] of PISTAS_VERSAO) {
    if (re.test(resto) || re.test(depois)) {
      versao = valor;
      resto = resto.replace(re, ' ');
      depois = depois.replace(re, ' ');
      break;
    }
  }

  const equipa = limpar(resto.replace(/\bkit\b/i, ' ').replace(/[-–·]+\s*$/, ''));
  if (!equipa) return null;

  const detalhe = limpar(depois.replace(/\bkit\b/gi, ' ').replace(/^[\s\-–·]+|[\s\-–·]+$/g, ''));
  return { equipa, epoca, tipo, versao, detalhe: detalhe || null };
}

module.exports = { TIPOS, VERSOES, nomeDe, emFalta, decompor };
