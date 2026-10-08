import { tentar, $, $$, desligarTudo, icone, aviso } from './util.js';
import * as painel from './paginas/painel.js';
import * as encomendas from './paginas/encomendas.js';
import * as encomenda from './paginas/encomenda.js';
import * as catalogo from './paginas/catalogo.js';
import * as clientes from './paginas/clientes.js';
import * as cliente from './paginas/cliente.js';
import * as definicoes from './paginas/definicoes.js';

const PAGINAS = { painel, encomendas, encomenda, catalogo, clientes, cliente, definicoes };

/** Estado partilhado que quase todas as paginas leem (moeda, tamanhos, estados). */
export const estado = { definicoes: {}, tamanhos: [], info: {}, atualizacao: {} };

async function recarregarEstado() {
  estado.definicoes = (await tentar('definicoes.mapa')) || {};
  estado.tamanhos = (await tentar('definicoes.tamanhos')) || [];
}

async function atualizarContagens() {
  const r = await tentar('painel.resumo');
  if (!r) return;
  const contas = { encomendas: r.encomendasAbertas, catalogo: r.catalogo, clientes: r.clientes };
  for (const [chave, valor] of Object.entries(contas)) {
    const el = $(`[data-conta="${chave}"]`);
    if (el) el.textContent = valor || '';
  }
}

function rota() {
  const bruto = (location.hash || '#/painel').replace(/^#\/?/, '');
  const [nome, ...resto] = bruto.split('/');
  return { nome: nome || 'painel', args: resto };
}

async function desenhar() {
  const { nome, args } = rota();
  const pagina = PAGINAS[nome] || PAGINAS.painel;

  $$('#nav a').forEach((a) => {
    const alvo = a.dataset.pagina;
    const ativa = alvo === nome
      || (nome === 'encomenda' && alvo === 'encomendas')
      || (nome === 'cliente' && alvo === 'clientes')
      || (!PAGINAS[nome] && alvo === 'painel');
    a.classList.toggle('ativo', ativa);
  });

  const conteudo = $('#conteudo');
  desligarTudo(conteudo); // as ligacoes da pagina anterior nao podem sobreviver a esta
  conteudo.innerHTML = '<div class="a-carregar">A carregar…</div>';

  try {
    await pagina.desenhar(conteudo, ...args);
    // Repete a animacao de entrada a cada pagina, e nao so na primeira.
    conteudo.style.animation = 'none';
    void conteudo.offsetWidth;
    conteudo.style.animation = '';
  } catch (erro) {
    conteudo.innerHTML = `<div class="vazio">
      <div class="circ">${icone('alerta', 26)}</div>
      <h3>Não foi possível abrir esta página</h3>
      <p>${String(erro.message || erro)}</p></div>`;
  }
  atualizarContagens();
}

/** As paginas chamam isto depois de mudar dados, para redesenhar sem perder a rota. */
export async function recarregar() {
  await recarregarEstado();
  await desenhar();
}

// ------------------------------------------------------------------ tema

export function temaEscolhido() {
  try { return localStorage.getItem('tema') || 'sistema'; } catch { return 'sistema'; }
}

export function aplicarTema(escolha) {
  try { localStorage.setItem('tema', escolha); } catch { /* sem armazenamento */ }
  const escuro = escolha === 'escuro'
    || (escolha === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
  pintarBotaoTema();
}

function pintarBotaoTema() {
  const b = $('#trocar-tema');
  if (!b) return;
  const escuro = document.documentElement.dataset.tema === 'escuro';
  b.innerHTML = icone(escuro ? 'sol' : 'lua', 16);
  b.title = escuro ? 'Mudar para claro' : 'Mudar para escuro';
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (temaEscolhido() === 'sistema') aplicarTema('sistema');
});

// ------------------------------------------------------------------ arranque

window.addEventListener('hashchange', desenhar);

window.api.aoAtualizacao(async (a) => {
  const antes = estado.atualizacao?.fase;
  estado.atualizacao = a;
  const { pintarAtualizacao } = await import('./paginas/definicoes.js');
  pintarAtualizacao(a);
  if (a.fase === 'pronta' && antes !== 'pronta') {
    aviso('Instala-se quando fechares a app, ou já em Definições.', 'ok', `Versão ${a.versaoNova} pronta`);
  }
});

window.api.aoAtalho(async (tipo, valor) => {
  if (tipo === 'pagina') location.hash = `#/${valor}`;
  if (tipo === 'nova-encomenda') {
    const { novaEncomenda } = await import('./paginas/encomendas.js');
    novaEncomenda();
  }
  if (tipo === 'importar') {
    const { abrirImportador } = await import('./paginas/importar.js');
    abrirImportador();
  }
});

(async function arrancar() {
  $$('[data-ic]').forEach((el) => { el.outerHTML = icone(el.dataset.ic, 18); });
  pintarBotaoTema();
  $('#trocar-tema').addEventListener('click', () => {
    aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  });

  estado.info = (await tentar('app.info')) || {};
  $('#rodape-versao').textContent = `Versão ${estado.info.versao || '?'}`;
  await recarregarEstado();
  await desenhar();
})();
