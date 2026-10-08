'use strict';

const fs = require('fs');
const path = require('path');

/**
 * A imagem que se manda a cada cliente para confirmar o pedido: as camisolas
 * dele, com foto, tamanho e estampagem, o preco de cada uma e o total.
 *
 * A regra e a mesma do Excel, ao contrario: aqui so entra o preco AO CLIENTE.
 * Nenhum preco de fornecedor, nenhuma margem, nenhum lucro.
 *
 * Este ficheiro so faz o HTML; quem o passa a PNG e o `render-imagem.js`.
 */

const LARGURA = 1080; // a largura com que o WhatsApp mostra uma imagem sem a reduzir

const PASTA_FONTES = path.join(__dirname, '..', '..', 'renderer', 'fonts');
let fontesEmCache = null;

/** As fontes vao dentro do HTML: o ficheiro temporario nao tem de saber onde estao. */
function fontes() {
  if (fontesEmCache) return fontesEmCache;
  const embutir = (ficheiro) => {
    const b64 = fs.readFileSync(path.join(PASTA_FONTES, ficheiro)).toString('base64');
    return `url(data:font/woff2;base64,${b64}) format('woff2')`;
  };
  fontesEmCache = `
    @font-face { font-family: 'Manrope'; src: ${embutir('manrope-latin-wght-normal.woff2')}; font-weight: 200 800; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD; }
    @font-face { font-family: 'Manrope'; src: ${embutir('manrope-latin-ext-wght-normal.woff2')}; font-weight: 200 800; unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    @font-face { font-family: 'Barlow Condensed'; src: ${embutir('barlow-condensed-latin-600-normal.woff2')}; font-weight: 600; }
    @font-face { font-family: 'Barlow Condensed'; src: ${embutir('barlow-condensed-latin-700-normal.woff2')}; font-weight: 700; }`;
  return fontesEmCache;
}

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function eur(centimos, moeda = '€') {
  const neg = centimos < 0;
  const a = Math.abs(centimos || 0);
  const inteiro = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${inteiro},${String(a % 100).padStart(2, '0')} ${moeda}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

function dataLonga(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!a || !m || !d) return '';
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

/** Os nomes vieram do Excel em maiusculas; na imagem le-se melhor "João Sousa". */
function nomeProprio(nome) {
  const t = String(nome || '').trim();
  if (!t || t !== t.toUpperCase()) return t;
  const pequenas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return t.toLowerCase().split(/(\s+|\/|-)/).map((p, i) => (
    pequenas.has(p) && i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
  )).join('');
}

/** "Ronaldo - 7 - Badge" em nome, numero e o resto, como nas costas da camisola. */
function estampa(texto) {
  const partes = String(texto || '').split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const iNum = partes.findIndex((p) => /^\d{1,3}$/.test(p));
  const numero = iNum >= 0 ? partes[iNum] : null;
  const resto = partes.filter((_, i) => i !== iNum);
  const nome = resto.shift() || '';
  return { nome, numero, extras: resto };
}

/**
 * As linhas que se mostram ao cliente. Uma camisola "em falta" vai de volta ao
 * fornecedor: nao se cobra, por isso tambem nao aparece no pedido dele.
 */
function linhasParaCliente(grupo) {
  return grupo.linhas.filter((l) => l.estado_chegada !== 'em_falta');
}

const CAMISOLA_SVG = `<svg viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.4"
  stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 4.5 5 2 10l3.5 1.8L7 10v11h10V10l1.5 1.8L22 10l-2.5-5L15 3c0 1.7-1.3 3-3 3S9 4.7 9 3z"/></svg>`;

function cartao(l, moeda, fotoDe) {
  const foto = l.camisola_foto ? fotoDe(l.camisola_foto) : null;
  const e = l.personalizacao ? estampa(l.personalizacao_texto) : null;
  const temEstampa = e && (e.nome || e.numero || e.extras.length);

  return `
    <article class="cartao">
      <div class="foto${foto ? '' : ' vazia'}">
        ${foto ? `<img src="${foto}" alt="">` : CAMISOLA_SVG}
        <span class="tam${l.tamanho ? '' : ' sem'}">${esc(l.tamanho || '?')}</span>
      </div>
      <div class="corpo">
        <div class="nome">${esc(l.camisola_nome)}</div>
        <div class="estampa">${temEstampa ? `
          ${e.nome ? `<span class="n">${esc(e.nome)}</span>` : ''}
          ${e.numero ? `<span class="num">${esc(e.numero)}</span>` : ''}
          ${e.extras.map((x) => `<span class="extra">${esc(x)}</span>`).join('')}`
    : '<span class="liso">Sem personalização</span>'}
        </div>
        <div class="preco">${esc(eur(l.preco_cliente, moeda))}</div>
      </div>
    </article>`;
}

/**
 * HTML da imagem de um cliente.
 * `fotoDe(nome)` devolve um data URL da foto (ou null): vem de fora para o
 * modelo nao depender da base e poder ser testado sozinho.
 */
function htmlCliente(grupo, encomenda, { moeda = '€', fotoDe = () => null, mensagem = null } = {}) {
  const linhas = linhasParaCliente(grupo);
  const total = linhas.reduce((t, l) => t + (l.preco_cliente || 0), 0);
  const pago = linhas.filter((l) => l.pago).reduce((t, l) => t + (l.preco_cliente || 0), 0);
  const falta = total - pago;
  const n = linhas.length;
  const nota = mensagem || 'Confirma se está tudo certo: camisola, tamanho e nome/número.';
  // Muitas camisolas em duas colunas davam uma imagem de quase 6000 px, que o
  // WhatsApp reduz ate nao se ler. A partir de 5 passam a tres colunas.
  const colunas = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const k = colunas === 3 ? 0.78 : 1;
  const px = (v) => `${Math.round(v * k)}px`;

  return `<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8">
<style>
${fontes()}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${LARGURA}px; background: #F5F6F8; overflow: hidden; }
::-webkit-scrollbar { display: none; }
body { font-family: 'Manrope', 'Segoe UI', sans-serif; color: #0E1526; -webkit-font-smoothing: antialiased; }

.topo {
  position: relative; overflow: hidden; color: #fff; padding: 64px 72px 120px;
  background:
    repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 26px, transparent 26px 52px),
    linear-gradient(135deg, #0E1526 0%, #1E1B4B 58%, #3730A3 100%);
}
.topo::after {
  content: ''; position: absolute; right: -120px; top: -160px; width: 520px; height: 520px; border-radius: 50%;
  background: radial-gradient(circle, rgba(124,131,255,.45), transparent 68%);
}
.etiqueta { display: inline-block; font: 700 22px/1 'Manrope'; letter-spacing: 4px; text-transform: uppercase;
  color: #A9AEFF; margin-bottom: 22px; }
.quem { position: relative; z-index: 1; font: 700 112px/.92 'Barlow Condensed', 'Arial Narrow', sans-serif;
  text-transform: uppercase; letter-spacing: 1px; word-break: break-word; }
.meta { position: relative; z-index: 1; margin-top: 22px; font: 600 28px/1.35 'Manrope'; color: rgba(255,255,255,.72); }
.meta b { color: #fff; font-weight: 800; }

.grelha { display: grid; grid-template-columns: repeat(${colunas}, minmax(0, 1fr)); gap: ${colunas === 3 ? 22 : 28}px; padding: 0 56px;
  margin-top: -72px; position: relative; z-index: 2; }
.cartao { background: #fff; border-radius: ${px(26)}; overflow: hidden;
  box-shadow: 0 2px 4px rgba(16,24,40,.05), 0 18px 40px -16px rgba(16,24,40,.22);
  display: flex; flex-direction: ${n === 1 ? 'row' : 'column'}; }
.foto { position: relative; background: linear-gradient(180deg, #EEF0F4, #E4E7EC);
  ${n === 1 ? 'width: 460px; min-height: 460px; flex: none;' : 'aspect-ratio: 1 / 1;'}
  display: flex; align-items: center; justify-content: center; }
.foto img { width: 100%; height: 100%; object-fit: contain; position: absolute; inset: 0; }
.foto.vazia { color: #B4BBC8; }
.tam { position: absolute; left: ${px(20)}; top: ${px(20)}; min-width: ${px(62)}; height: ${px(62)}; padding: 0 ${px(14)}; border-radius: ${px(16)};
  background: #0E1526; color: #fff; font: 700 ${px(36)}/${px(62)} 'Barlow Condensed'; text-align: center; letter-spacing: .5px;
  box-shadow: 0 6px 16px -4px rgba(14,21,38,.45); }
.tam.sem { background: #fff; color: #8A93A6; box-shadow: inset 0 0 0 2px #D0D5DD; }
.corpo { padding: ${px(26)} ${px(30)} ${px(30)}; display: flex; flex-direction: column; gap: ${px(14)}; flex: 1;
  ${n === 1 ? 'justify-content: center; padding: 44px 48px;' : ''} }
.nome { font: 800 ${n === 1 ? '36px' : px(28)}/1.22 'Manrope'; color: #0E1526; }
.estampa { display: flex; flex-wrap: wrap; align-items: baseline; gap: ${px(10)}; min-height: ${px(40)}; }
.estampa .n { font: 700 ${px(32)}/1 'Barlow Condensed'; text-transform: uppercase; letter-spacing: 1.5px; }
.estampa .num { font: 700 ${px(46)}/.9 'Barlow Condensed'; color: #4F46E5; }
.estampa .extra { font: 700 ${px(18)}/1 'Manrope'; color: #475467; background: #EEF0F4; padding: ${px(7)} ${px(11)}; border-radius: 8px;
  align-self: center; }
.estampa .liso { font: 600 ${px(21)}/1.3 'Manrope'; color: #8A93A6; align-self: center; }
.preco { margin-top: auto; padding-top: ${px(16)}; border-top: 2px dashed #E4E7EC;
  font: 700 ${n === 1 ? '64px' : px(50)}/1 'Barlow Condensed'; color: #0E1526; text-align: right; letter-spacing: .5px; }

.total { margin: 40px 56px 0; border-radius: 28px; padding: 40px 48px; color: #fff;
  background: linear-gradient(120deg, #4F46E5, #3730A3);
  box-shadow: 0 24px 48px -18px rgba(79,70,229,.6);
  display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.total .rot { font: 800 24px/1.2 'Manrope'; letter-spacing: 3px; text-transform: uppercase; color: #C7CAFF; }
.total .sub { margin-top: 10px; font: 600 24px/1.3 'Manrope'; color: rgba(255,255,255,.8); }
.total .val { font: 700 104px/.9 'Barlow Condensed'; letter-spacing: 1px; white-space: nowrap; }

.nota { margin: 36px 56px 0; padding-bottom: 60px; display: flex; gap: 18px; align-items: flex-start;
  font: 600 26px/1.45 'Manrope'; color: #475467; }
.nota .ic { flex: none; width: 44px; height: 44px; border-radius: 50%; background: #E7F6EC; color: #15803D;
  display: flex; align-items: center; justify-content: center; margin-top: -2px; }
</style></head>
<body>
  <header class="topo">
    <div class="etiqueta">O teu pedido</div>
    <div class="quem">${esc(nomeProprio(grupo.cliente_nome))}</div>
    <div class="meta"><b>${n} ${n === 1 ? 'camisola' : 'camisolas'}</b>${encomenda.data ? ` · encomenda de ${esc(dataLonga(encomenda.data))}` : ''}</div>
  </header>

  <main class="grelha">
    ${linhas.map((l) => cartao(l, moeda, fotoDe)).join('')}
  </main>

  <section class="total">
    <div>
      <div class="rot">${pago && falta ? 'Falta pagar' : pago ? 'Pago' : 'Total a pagar'}</div>
      ${pago && falta ? `<div class="sub">Total ${esc(eur(total, moeda))} · já pagaste ${esc(eur(pago, moeda))}</div>` : ''}
      ${n > 1 && !(pago && falta) ? `<div class="sub">${n} camisolas</div>` : ''}
    </div>
    <div class="val">${esc(eur(pago && falta ? falta : total, moeda))}</div>
  </section>

  <div class="nota">
    <div class="ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <div>${esc(nota)}</div>
  </div>
</body></html>`;
}

module.exports = { htmlCliente, linhasParaCliente, LARGURA };
