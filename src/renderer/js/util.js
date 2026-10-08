// Ajudas partilhadas por todas as paginas.
import { icone } from './icones.js';

export { icone };

/** Chamada ao processo principal. Todos os erros passam pelo aviso no ecra. */
export async function chamar(metodo, ...args) {
  try {
    return await window.api.chamar(metodo, ...args);
  } catch (erro) {
    aviso(limparErro(erro), 'erro', 'Não foi possível concluir');
    throw erro;
  }
}

/** Como `chamar`, mas devolve null em vez de rebentar o ecra todo. */
export async function tentar(metodo, ...args) {
  try {
    return await window.api.chamar(metodo, ...args);
  } catch {
    return null;
  }
}

// O Electron embrulha a mensagem em "Error invoking remote method 'chamar': Error: ...".
function limparErro(erro) {
  return String(erro?.message || erro).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Centimos para texto. O calculo e sempre do lado do processo principal. */
export function eur(centimos, moeda = '€') {
  if (centimos === null || centimos === undefined) return '—';
  const neg = centimos < 0;
  const a = Math.abs(centimos);
  const inteiro = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${inteiro},${String(a % 100).padStart(2, '0')} ${moeda}`;
}

/** Le euros escritos a mao ("12", "12,5") e devolve centimos. */
export function centimos(texto) {
  if (texto === '' || texto === null || texto === undefined) return null;
  const n = Number(String(texto).replace(/[^\d,.\-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centimos para o que se escreve numa caixa: "12,50". */
export function valorEuro(c) {
  if (c === null || c === undefined) return '';
  return (c / 100).toFixed(2).replace('.', ',');
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function data(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** "28 jun 2026" - para cabecalhos, onde a data se le e nao se confere. */
export function dataLonga(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

export function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

export function fotoUrl(nome) {
  return nome ? `foto://${encodeURIComponent(nome)}` : null;
}

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/**
 * "JOÃO SOUSA" passa a "João Sousa" no ecra. Os nomes vieram do Excel todos em
 * maiusculas e a pagina gritava; a base fica como esta.
 */
export function nomeProprio(nome) {
  const t = String(nome || '').trim();
  if (!t || t !== t.toUpperCase()) return t; // escrito a mao com minusculas: respeita-se
  return t.toLowerCase().split(/(\s+|\/|-)/).map((p, i) => (
    MINUSCULAS.has(p) && i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
  )).join('');
}

/** Titulo todo em maiusculas passa a frase normal: "Encomenda camisolas - 28/06/2026". */
export function tituloLegivel(t) {
  const s = String(t || '').trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/**
 * O que a estampagem custa, para mostrar a conta enquanto se escreve. Espelha
 * `servicos/precos.custoEstampagem`; quem decide o preco gravado e o servidor.
 */
export function custoEstampagem(texto, { personalizacao = true, nomeNumero = 0, soUm = 0 } = {}) {
  if (!personalizacao) return 0;
  const partes = String(texto || '').split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const temNumero = partes.some((p) => /^\d{1,3}$/.test(p));
  const temNome = partes.some((p) => /\p{L}/u.test(p) && !/^\d+$/.test(p));
  if (temNome && temNumero) return nomeNumero;
  if (temNome || temNumero) return soUm;
  return nomeNumero;
}

export function iniciais(nome) {
  const partes = String(nome || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function $(sel, raiz = document) { return raiz.querySelector(sel); }
export function $$(sel, raiz = document) { return [...raiz.querySelectorAll(sel)]; }

/**
 * Liga os eventos por delegacao: um so ouvinte por pagina em vez de um por linha.
 * O contentor e o mesmo em todas as paginas e redesenhos, por isso uma ligacao
 * nova substitui a anterior - senao cada visita somava um ouvinte e um clique
 * abria N janelas.
 */
export function ligar(raiz, evento, seletor, fn) {
  raiz._ligacoes ??= new Map();
  const chave = `${evento}|${seletor}`;
  const antiga = raiz._ligacoes.get(chave);
  if (antiga) raiz.removeEventListener(evento, antiga);

  const ouvinte = (e) => {
    const alvo = e.target.closest(seletor);
    if (alvo && raiz.contains(alvo)) fn(e, alvo);
  };
  raiz._ligacoes.set(chave, ouvinte);
  raiz.addEventListener(evento, ouvinte);
}

/** Tira todas as ligacoes de um contentor; o router chama-o ao mudar de pagina. */
export function desligarTudo(raiz) {
  if (!raiz._ligacoes) return;
  for (const [chave, ouvinte] of raiz._ligacoes) raiz.removeEventListener(chave.split('|')[0], ouvinte);
  raiz._ligacoes.clear();
}

// ------------------------------------------------------------------ avisos

export function aviso(texto, tipo = 'ok', titulo = null) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = icone(tipo === 'erro' ? 'alerta' : 'visto', 18)
    + `<div>${titulo ? `<b>${esc(titulo)}</b>` : ''}<small>${esc(texto)}</small></div>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  }, tipo === 'erro' ? 7000 : 3800);
}

export function caixa(texto, tipo = 'aviso') {
  const ic = { aviso: 'alerta', info: 'info', ok: 'visto' }[tipo] || 'info';
  return `<div class="caixa-aviso ${tipo === 'aviso' ? '' : tipo}">${icone(ic, 18)}<div>${texto}</div></div>`;
}

/** Modal generico. Devolve uma promessa com o que o `aoConfirmar` retornar, ou null. */
export function modal({ titulo, corpo, largo = false, confirmar = 'Guardar', cancelar = 'Cancelar', perigo = false, aoAbrir, aoConfirmar }) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-host');
    const fundo = document.createElement('div');
    fundo.className = 'fundo-modal';
    fundo.innerHTML = `
      <div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <header>
          <h3>${esc(titulo)}</h3>
          <button class="btn fantasma icone fechar" data-fechar aria-label="Fechar">${icone('fechar', 18)}</button>
        </header>
        <div class="corpo">${corpo}</div>
        ${confirmar || cancelar ? `<footer>
          ${cancelar ? `<button class="btn" data-fechar>${esc(cancelar)}</button>` : ''}
          ${confirmar ? `<button class="btn ${perigo ? 'perigo' : 'primario'}" data-ok>${esc(confirmar)}</button>` : ''}
        </footer>` : ''}
      </div>`;
    host.appendChild(fundo);

    const fechar = (v) => { fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(null); };
    document.addEventListener('keydown', tecla);

    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(null); });
    fundo.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(null); });

    const botaoOk = fundo.querySelector('[data-ok]');
    if (botaoOk) {
      botaoOk.addEventListener('click', async () => {
        botaoOk.disabled = true;
        try {
          const r = aoConfirmar ? await aoConfirmar(fundo) : true;
          if (r === false) { botaoOk.disabled = false; return; } // validacao falhou
          fechar(r);
        } catch {
          botaoOk.disabled = false;
        }
      });
    }

    if (aoAbrir) aoAbrir(fundo, fechar);
    const primeiro = fundo.querySelector('.corpo input:not([type="checkbox"]):not([readonly]), .corpo select, .corpo textarea');
    if (primeiro) setTimeout(() => primeiro.focus(), 40);
  });
}

export function confirmar(titulo, texto, { confirmar: rot = 'Confirmar', perigo = true } = {}) {
  return modal({
    titulo,
    corpo: `<p style="line-height:1.65;color:var(--tinta-2);font-size:13.5px">${texto}</p>`,
    confirmar: rot,
    perigo,
    aoConfirmar: () => true
  });
}

// -------------------------------------------------------------- blocos

export function vazio(ic, titulo, texto, botoes = '') {
  return `<div class="vazio">
    <div class="circ">${icone(ic, 26)}</div>
    <h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
    ${botoes ? `<div class="acoes">${botoes}</div>` : ''}
  </div>`;
}

/** Um numero da faixa. `valor` pode trazer HTML ja escapado. */
export function kpi(rotulo, valor, sub = '', cor = '', extra = '') {
  return `<div class="kpi ${cor}">
    <div class="rot">${esc(rotulo)}</div>
    <div class="val">${valor}</div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    ${extra}
  </div>`;
}

export function faixa(...kpis) {
  return `<div class="faixa">${kpis.filter(Boolean).join('')}</div>`;
}

export function barra(percentagem, cor = '') {
  return `<div class="barra-prog"><i style="width:${Math.max(0, Math.min(100, percentagem))}%${cor ? `;background:${cor}` : ''}"></i></div>`;
}

export function tamanho(t) {
  return t ? `<span class="tam">${esc(t)}</span>` : '<span class="tam sem">?</span>';
}

/**
 * "Ronaldo - 7 - Badge Mundial" vira o nome e o numero na letra das
 * camisolas, e o resto (simbolos, emblemas) numa etiqueta a parte.
 */
export function estampa(texto) {
  const partes = String(texto || '').split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return '<span class="dim">—</span>';
  const iNum = partes.findIndex((p) => /^\d{1,3}$/.test(p));
  const numero = iNum >= 0 ? partes[iNum] : null;
  const resto = partes.filter((_, i) => i !== iNum);
  const nome = resto.shift() || '';
  return `<span class="estampa">
    ${nome ? `<span class="n">${esc(nome)}</span>` : ''}
    ${numero ? `<span class="num">${esc(numero)}</span>` : ''}
    ${resto.map((r) => `<span class="extra">${esc(r)}</span>`).join('')}
  </span>`;
}

export function fotoMini(nome, classe = 'mini') {
  const url = fotoUrl(nome);
  return url
    ? `<div class="foto ${classe}" style="background-image:url('${url}')"></div>`
    : `<div class="foto ${classe} vazia">${icone('camisola', 20)}</div>`;
}

const ESTADOS = {
  rascunho: ['', 'Rascunho'],
  enviada: ['info', 'Enviada'],
  em_producao: ['acento', 'Em produção'],
  recebida: ['aviso', 'Recebida'],
  entregue: ['ok', 'Entregue'],
  fechada: ['', 'Fechada']
};

const CHEGADAS = {
  pendente: ['', 'Por chegar', 'var(--linha-forte)'],
  chegou: ['ok', 'Chegou', 'var(--ok)'],
  // "Em falta" e o que vai de volta ao fornecedor, e por isso nao e vendido.
  em_falta: ['mau', 'Para devolver', 'var(--mau)'],
  errada: ['aviso', 'Errada', 'var(--aviso)']
};

export function etiquetaEstado(estado) {
  const [cor, texto] = ESTADOS[estado] || ['', estado];
  return `<span class="pilula ${cor}">${esc(texto)}</span>`;
}

export function etiquetaChegada(estado) {
  const [cor, texto] = CHEGADAS[estado] || ['', estado];
  return `<span class="pilula ${cor}">${esc(texto)}</span>`;
}

export { ESTADOS as ETIQUETAS_ESTADO, CHEGADAS as ETIQUETAS_CHEGADA };
