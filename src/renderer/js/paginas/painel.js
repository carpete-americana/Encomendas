import {
  chamar, esc, eur, data, dataLonga, etiquetaEstado, ligar, vazio, icone, fotoMini, iniciais,
  plural, nomeProprio, tituloLegivel, ETIQUETAS_CHEGADA
} from '../util.js';
import { estado } from '../app.js';

const FECHADAS = ['entregue', 'fechada'];

export async function desenhar(raiz) {
  const [resumo, lista, catalogo, clientes] = await Promise.all([
    chamar('painel.resumo'),
    chamar('encomendas.listar'),
    chamar('camisolas.listar', { ordem: 'populares' }),
    chamar('clientes.listar')
  ]);

  const moeda = estado.definicoes.moeda || '€';
  const abertas = lista.filter((e) => !FECHADAS.includes(e.estado));
  // A encomenda em destaque e a aberta mais recente; sem abertas, a ultima de todas.
  const emCurso = abertas[0] || lista[0] || null;
  const outras = lista.filter((e) => e !== emCurso).slice(0, 5);
  const devedores = clientes.filter((x) => x.por_receber > 0).sort((a, b) => b.por_receber - a.por_receber);
  const topo = catalogo.filter((x) => x.vezes_encomendada > 0).slice(0, 5);
  const h = resumo.historico;
  const hoje = new Date().toISOString().slice(0, 10);

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Painel</h1>
        <div class="sub"><span>${dataLonga(hoje)}</span>
          <span class="ponto">${abertas.length ? `${plural(abertas.length, 'encomenda', 'encomendas')} por fechar` : 'Nada por fechar'}</span></div>
      </div>
      <div class="acoes">
        <button class="btn" data-importar>${icone('importar', 16)}Importar Excel</button>
        <button class="btn primario" data-nova>${icone('mais', 16)}Nova encomenda</button>
      </div>
    </div>

    ${emCurso ? destaque(emCurso, moeda) : `<div class="cartao">${vazio('encomendas', 'Ainda não há encomendas',
    'Cria a primeira, ou importa o Excel que já fazias à mão para trazer os clientes e as camisolas de uma vez.',
    `<button class="btn primario" data-nova>${icone('mais', 16)}Nova encomenda</button><button class="btn" data-importar>${icone('importar', 16)}Importar Excel</button>`)}</div>`}

    ${lista.length ? `
    <div class="grelha-2" style="margin-top:20px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <div class="cartao sem-pad">
        <div class="cartao-cabeca"><h3>Quem ainda deve</h3>
          ${devedores.length ? `<span class="total">${eur(h.porReceber, moeda)}</span>` : ''}</div>
        <div class="lista-simples">
          ${devedores.length ? devedores.slice(0, 7).map((x) => `
            <a href="#/cliente/${x.id}">
              <div class="avatar">${esc(iniciais(x.nome))}</div>
              <div><div class="t">${esc(nomeProprio(x.nome))}</div><div class="s">${plural(x.total_camisolas, 'camisola', 'camisolas')}</div></div>
              <div class="dir"><span class="dinheiro">${eur(x.por_receber, moeda)}</span></div>
            </a>`).join('')
    + (devedores.length > 7 ? `<a href="#/clientes"><div class="s">Mais ${devedores.length - 7}…</div>
              <div class="dir">${icone('seguir', 16)}</div></a>` : '')
    : '<div><div class="s">Ninguém te deve nada.</div></div>'}
        </div>
      </div>

      <div class="cartao sem-pad">
        <div class="cartao-cabeca"><h3>Mais pedidas</h3><a class="dir" href="#/catalogo">Catálogo</a></div>
        <div class="lista-simples">
          ${topo.map((x) => `
            <a href="#/catalogo" data-camisola="${x.id}">
              ${fotoMini(x.foto)}
              <div style="min-width:0"><div class="t">${esc(x.nome)}</div>
                <div class="s">${x.preco_fornecedor !== null ? eur(x.preco_fornecedor, moeda) : 'Sem preço'}</div></div>
              <div class="dir"><span class="dinheiro">${x.vezes_encomendada}×</span></div>
            </a>`).join('') || '<div><div class="s">Ainda nada.</div></div>'}
        </div>
      </div>
    </div>

    ${outras.length ? `
    <h2 class="secao">Outras encomendas <a class="dir pequeno dim" href="#/encomendas">Ver todas</a></h2>
    <div class="cartao sem-pad"><div class="lista-simples">
      ${outras.map((e) => `
        <a href="#/encomenda/${e.id}">
          <div style="min-width:0"><div class="t">${esc(tituloLegivel(e.titulo))}</div>
            <div class="s">${data(e.data)} · ${plural(e.totais.nCamisolas, 'camisola', 'camisolas')}</div></div>
          <div class="dir linha-flex" style="gap:14px">${etiquetaEstado(e.estado)}
            <span class="dinheiro" style="color:var(--ok)">${eur(e.totais.lucro, moeda)}</span></div>
        </a>`).join('')}
    </div></div>` : ''}

    <div class="historico-linha">
      <span class="titulo">Desde o início</span>
      <span><b>${h.nCamisolas}</b>camisolas</span>
      <span><b>${plural(lista.length, 'encomenda', 'encomendas')}</b></span>
      <span><b>${eur(h.totalCliente, moeda)}</b>cobrados</span>
      <span><b style="color:var(--ok)">${eur(h.lucro, moeda)}</b>de lucro</span>
      <span><b>${eur(h.lucroMedio, moeda)}</b>por camisola</span>
    </div>` : ''}`;

  ligar(raiz, 'click', '[data-camisola]', async (e, el) => {
    e.preventDefault();
    const { editarCamisola } = await import('./catalogo.js');
    if (await editarCamisola(Number(el.dataset.camisola))) desenhar(raiz);
  });
  ligar(raiz, 'click', '[data-nova]', async () => {
    const { novaEncomenda } = await import('./encomendas.js');
    novaEncomenda();
  });
  ligar(raiz, 'click', '[data-importar]', async () => {
    const { abrirImportador } = await import('./importar.js');
    abrirImportador();
  });
}

/** A encomenda em curso: o que chegou, o que falta cobrar, e o caminho para ela. */
function destaque(e, moeda) {
  const t = e.totais;
  const partes = [['chegou', t.chegaram], ['errada', t.erradas], ['em_falta', t.emFalta], ['pendente', t.pendentes]];
  const aberta = !FECHADAS.includes(e.estado);

  return `
    <section class="destaque">
      <div class="principal">
        <div class="etiqueta-topo">${aberta ? 'Em curso' : 'Última encomenda'} ${etiquetaEstado(e.estado)}</div>
        <h2><a href="#/encomenda/${e.id}">${esc(tituloLegivel(e.titulo))}</a></h2>
        <div class="meta">${dataLonga(e.data)} · ${plural(e.clientes_distintos || 0, 'cliente', 'clientes')} · ${plural(t.nCamisolas, 'camisola', 'camisolas')}</div>

        <div class="chegadas">
          <div class="cabeca-barra">
            <div class="linha-flex" style="gap:10px;align-items:baseline"><span class="grande">${t.chegaram}<small>/${t.nCamisolas}</small></span><span class="pequeno" style="font-weight:700;color:var(--tinta-2)">camisolas chegaram</span></div>
            <span class="pequeno dim" style="font-weight:700">${t.percentagemChegadas}%</span>
          </div>
          <div class="empilhada">
            ${t.nCamisolas ? partes.map(([k, n]) => (n ? `<i style="width:${(n / t.nCamisolas) * 100}%;background:${ETIQUETAS_CHEGADA[k][2]}"></i>` : '')).join('') : ''}
          </div>
          <div class="legenda">
            ${partes.map(([k, n]) => `<span style="--c:${ETIQUETAS_CHEGADA[k][2]}">${ETIQUETAS_CHEGADA[k][1]}</span><b>${n}</b>`).join('')}
          </div>
        </div>
      </div>

      <div class="lado">
        <div class="numero ${t.porReceber ? 'aviso' : 'ok'}">
          <div class="rot">Por receber</div>
          <div class="val">${eur(t.porReceber, moeda)}</div>
          <div class="sub">${t.porReceber ? `${t.nCamisolas - t.nPagas} de ${t.nCamisolas} camisolas por pagar` : 'Tudo pago'}</div>
        </div>
        <div class="numero ok">
          <div class="rot">Lucro</div>
          <div class="val">${eur(t.lucro, moeda)}</div>
          <div class="sub">${eur(t.totalCliente, moeda)} cobrado − ${eur(t.totalFornecedor, moeda)} ao fornecedor</div>
        </div>
        <a class="btn primario" href="#/encomenda/${e.id}">Abrir encomenda${icone('seta', 16)}</a>
      </div>
    </section>`;
}
