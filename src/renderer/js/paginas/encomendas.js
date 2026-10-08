import {
  chamar, esc, eur, data, ligar, vazio, etiquetaEstado, confirmar, modal, icone, barra, plural, faixa, kpi, tituloLegivel
} from '../util.js';
import { estado, recarregar } from '../app.js';

const FECHADAS = ['entregue', 'fechada'];
let filtro = 'abertas';

export async function desenhar(raiz) {
  const lista = await chamar('encomendas.listar');
  const moeda = estado.definicoes.moeda || '€';

  const abertas = lista.filter((e) => !FECHADAS.includes(e.estado));
  const fechadas = lista.filter((e) => FECHADAS.includes(e.estado));
  const visiveis = { todas: lista, abertas, fechadas }[filtro];
  const soma = (arr, f) => arr.reduce((t, e) => t + f(e), 0);

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Encomendas</h1>
        <div class="sub"><span>${plural(lista.length, 'encomenda', 'encomendas')}</span>
          <span class="ponto">${abertas.length} por fechar</span></div>
      </div>
      <div class="acoes">
        <button class="btn" data-importar>${icone('importar', 16)}Importar Excel</button>
        <button class="btn primario" data-nova>${icone('mais', 16)}Nova encomenda</button>
      </div>
    </div>

    ${lista.length ? `
    ${faixa(
    kpi('Camisolas', soma(lista, (e) => e.totais.nCamisolas)),
    kpi('Fornecedor', eur(soma(lista, (e) => e.totais.totalFornecedor), moeda)),
    kpi('Clientes', eur(soma(lista, (e) => e.totais.totalCliente), moeda)),
    kpi('Lucro', eur(soma(lista, (e) => e.totais.lucro), moeda), '', 'ok'),
    kpi('Por receber', eur(soma(lista, (e) => e.totais.porReceber), moeda), '', soma(lista, (e) => e.totais.porReceber) ? 'aviso' : '')
  )}

    <div class="barra-ferramentas" style="margin-top:24px">
      <div class="segmentos" role="tablist">
        ${[['abertas', 'Por fechar', abertas.length], ['fechadas', 'Fechadas', fechadas.length], ['todas', 'Todas', lista.length]]
    .map(([k, t, n]) => `<button data-filtro="${k}" class="${filtro === k ? 'ativo' : ''}">${t} <span class="n">${n}</span></button>`).join('')}
      </div>
    </div>

    <div class="cartao sem-pad">
      ${visiveis.length ? `
      <table>
        <thead><tr>
          <th>Encomenda</th><th>Estado</th>
          <th class="num">Camisolas</th>
          <th class="num">Fornecedor</th><th class="num">Clientes</th><th class="num">Lucro</th>
          <th style="width:170px">Chegadas</th><th class="num">Por receber</th>
          <th style="width:44px"></th>
        </tr></thead>
        <tbody>${visiveis.map((e) => linha(e, moeda)).join('')}</tbody>
      </table>` : `<div style="padding:28px" class="pequeno dim">Nenhuma encomenda neste filtro.</div>`}
    </div>`
    : `<div class="cartao">${vazio('encomendas', 'Ainda não há encomendas',
      'Começa uma encomenda nova, ou importa o Excel que já fazias à mão — ele traz o catálogo e os clientes de uma vez.',
      `<button class="btn primario" data-nova>${icone('mais', 16)}Nova encomenda</button><button class="btn" data-importar>${icone('importar', 16)}Importar Excel</button>`)}</div>`}`;

  ligar(raiz, 'click', '[data-filtro]', (e, el) => { filtro = el.dataset.filtro; desenhar(raiz); });
  ligar(raiz, 'click', '[data-nova]', () => novaEncomenda());
  ligar(raiz, 'click', '[data-importar]', async () => {
    const { abrirImportador } = await import('./importar.js');
    abrirImportador();
  });

  ligar(raiz, 'click', '[data-apagar]', async (e, el) => {
    e.stopPropagation();
    const id = Number(el.dataset.apagar);
    const alvo = lista.find((x) => x.id === id);
    const ok = await confirmar(
      'Apagar a encomenda?',
      `<b>${esc(tituloLegivel(alvo.titulo))}</b> tem ${plural(alvo.totais.nCamisolas, 'camisola', 'camisolas')}. ` +
      'Apagar leva as linhas todas com ela. O catálogo e os clientes ficam.',
      { confirmar: 'Apagar encomenda' }
    );
    if (!ok) return;
    await chamar('encomendas.apagar', id);
    recarregar();
  });

  ligar(raiz, 'click', 'tr[data-abrir]', (e, el) => {
    if (e.target.closest('[data-apagar]')) return;
    location.hash = `#/encomenda/${el.dataset.abrir}`;
  });
}

function linha(e, moeda) {
  const t = e.totais;
  return `
    <tr class="clicavel" data-abrir="${e.id}">
      <td><div class="nome-cel"><div>
        <div class="t">${esc(tituloLegivel(e.titulo))}</div>
        <div class="s">${data(e.data)} · ${plural(e.clientes_distintos ?? 0, 'cliente', 'clientes')}${e.fornecedor ? ` · ${esc(e.fornecedor)}` : ''}</div>
      </div></div></td>
      <td>${etiquetaEstado(e.estado)}</td>
      <td class="num"><span class="dinheiro">${t.nCamisolas}</span></td>
      <td class="num"><span class="dinheiro">${eur(t.totalFornecedor, moeda)}</span></td>
      <td class="num"><span class="dinheiro">${eur(t.totalCliente, moeda)}</span></td>
      <td class="num"><span class="dinheiro ok">${eur(t.lucro, moeda)}</span></td>
      <td>
        <div class="linha-flex">${barra(t.percentagemChegadas)}<span class="dinheiro dim" style="font-size:14px">${t.chegaram}/${t.nCamisolas}</span></div>
        ${t.emFalta || t.erradas ? `<div style="margin-top:6px;display:flex;gap:4px">
          ${t.emFalta ? `<span class="pilula mau">${t.emFalta} em falta</span>` : ''}
          ${t.erradas ? `<span class="pilula aviso">${t.erradas} errada${t.erradas === 1 ? '' : 's'}</span>` : ''}
        </div>` : ''}
      </td>
      <td class="num"><span class="dinheiro ${t.porReceber ? 'aviso' : 'dim'}">${eur(t.porReceber, moeda)}</span></td>
      <td><button class="btn fantasma perigo icone pequeno" data-apagar="${e.id}" title="Apagar encomenda">${icone('lixo', 16)}</button></td>
    </tr>`;
}

export async function novaEncomenda() {
  const hoje = new Date().toISOString().slice(0, 10);
  const r = await modal({
    titulo: 'Nova encomenda',
    confirmar: 'Criar encomenda',
    corpo: `
      <div class="grelha-campos">
        <div class="campo"><label>Data</label><input type="date" name="data" value="${hoje}"></div>
        <div class="campo"><label>Fornecedor</label>
          <input name="fornecedor" value="${esc(estado.definicoes.fornecedor || '')}" placeholder="Opcional"></div>
      </div>
      <div class="campo"><label>Título</label>
        <input name="titulo" placeholder="Encomenda DD/MM/AAAA">
        <div class="dica">Vazio usa a data. O título não sai no Excel — esse leva o título das Definições.</div></div>
      <div class="campo"><label>Notas</label><textarea name="notas" placeholder="Opcional"></textarea></div>`,
    aoConfirmar: (m) => {
      const v = (n) => m.querySelector(`[name="${n}"]`).value.trim();
      return chamar('encomendas.criar', {
        data: v('data') || hoje,
        titulo: v('titulo') || null,
        fornecedor: v('fornecedor') || null,
        notas: v('notas') || null
      });
    }
  });
  if (r) location.hash = `#/encomenda/${r.id}`;
}
