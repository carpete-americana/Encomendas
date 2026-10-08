import {
  chamar, esc, eur, data, ligar, vazio, modal, aviso, centimos, valorEuro, icone, iniciais, plural, faixa, kpi, nomeProprio
} from '../util.js';
import { estado } from '../app.js';

let procura = '';
let filtro = 'todos';

export async function desenhar(raiz) {
  const todos = await chamar('clientes.listar');
  const moeda = estado.definicoes.moeda || '€';
  const porReceber = todos.reduce((t, c) => t + (c.por_receber || 0), 0);
  const devedores = todos.filter((c) => c.por_receber > 0);
  const aguardar = todos.filter((c) => c.por_entregar > 0 || c.por_devolver > 0);
  const prontos = todos.filter((c) => c.prontas_para_entregar > 0);
  const termo = procura.trim().toLowerCase();
  const porFiltro = { todos, devedores, aguardar, prontos }[filtro] || todos;
  const lista = porFiltro.filter((c) => !termo || c.nome.toLowerCase().includes(termo));

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Clientes</h1>
        <div class="sub"><span>${plural(todos.length, 'pessoa', 'pessoas')}</span>
          <span class="ponto">${devedores.length ? `${plural(devedores.length, 'deve', 'devem')} dinheiro` : 'ninguém deve nada'}</span></div>
      </div>
      <div class="acoes"><button class="btn primario" data-novo>${icone('mais', 16)}Novo cliente</button></div>
    </div>

    ${todos.length ? `
    ${faixa(
    kpi('Clientes', todos.length),
    kpi('Camisolas', todos.reduce((t, c) => t + c.total_camisolas, 0)),
    kpi('Faturação', eur(todos.reduce((t, c) => t + c.total_gasto, 0), moeda), 'soma do que cobraste'),
    kpi('Por receber', eur(porReceber, moeda), plural(devedores.length, 'pessoa', 'pessoas'), porReceber ? 'aviso' : 'ok'),
    kpi('Camisolas por entregar', todos.reduce((t, c) => t + c.por_entregar, 0),
      `${todos.reduce((t, c) => t + c.prontas_para_entregar, 0)} j\u00e1 c\u00e1 est\u00e3o`,
      todos.reduce((t, c) => t + c.prontas_para_entregar, 0) ? 'aviso' : '')
  )}

    <div class="barra-ferramentas" style="margin-top:24px">
      <div class="com-icone">${icone('procurar', 16)}<input type="search" data-procura placeholder="Procurar pelo nome" value="${esc(procura)}"></div>
      <div class="segmentos">
        ${[['todos', 'Todos', todos.length], ['devedores', 'Devem', devedores.length],
    ['prontos', 'Para entregar', prontos.length], ['aguardar', 'Falta receber', aguardar.length]]
    .map(([k, t, n]) => `<button data-ver="${k}" class="${filtro === k ? 'ativo' : ''}">${t} <span class="n">${n}</span></button>`).join('')}
      </div>
    </div>

    <div class="cartao sem-pad">
      ${lista.length ? `
      <table>
        <thead><tr>
          <th>Cliente</th>
          <th class="num">Camisolas</th><th class="num">Encomendas</th>
          <th class="num">Já gastou</th><th class="num">Por receber</th><th style="width:300px">Falta fazer</th>
          <th>Margem</th><th>Última encomenda</th><th style="width:44px"></th>
        </tr></thead>
        <tbody>
          ${lista.map((c) => `
            <tr class="clicavel" data-abrir="${c.id}">
              <td><div class="nome-cel"><div class="avatar">${esc(iniciais(c.nome))}</div>
                <div><div class="t nowrap">${esc(nomeProprio(c.nome))}</div><div class="s">${esc(c.contacto || 'Sem contacto')}</div></div></div></td>
              <td class="num"><span class="dinheiro">${c.total_camisolas}</span></td>
              <td class="num"><span class="dinheiro">${c.total_encomendas}</span></td>
              <td class="num"><span class="dinheiro">${eur(c.total_gasto, moeda)}</span></td>
              <td class="num"><span class="dinheiro ${c.por_receber ? 'aviso' : 'dim'}">${eur(c.por_receber, moeda)}</span></td>
              <td class="nowrap">${faltaFazer(c)}</td>
              <td>${c.margem_override !== null
    ? `<span class="pilula acento sem-ponto">${c.margem_override === 0 ? 'Ao custo' : `+${eur(c.margem_override, moeda)}`}</span>`
    : '<span class="pequeno dim" style="font-weight:600">Normal</span>'}</td>
              <td class="pequeno" style="font-weight:600;color:var(--tinta-2)">${c.ultima_encomenda ? data(c.ultima_encomenda) : '—'}</td>
              <td><button class="btn fantasma icone pequeno" data-editar="${c.id}" title="Editar ${esc(nomeProprio(c.nome))}">${icone('editar', 16)}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div style="padding:28px" class="pequeno dim">Ninguém corresponde a esta procura.</div>'}
    </div>`
    : `<div class="cartao">${vazio('clientes', 'Ainda não há clientes',
      'Os clientes nascem sozinhos quando escreves um nome numa encomenda. Também os podes criar aqui, por exemplo para lhes dar uma margem própria.',
      `<button class="btn primario" data-novo>${icone('mais', 16)}Novo cliente</button>`)}</div>`}`;

  const caixa = raiz.querySelector('[data-procura]');
  caixa?.addEventListener('input', () => {
    procura = caixa.value;
    const pos = caixa.selectionStart;
    desenhar(raiz).then(() => {
      const nova = raiz.querySelector('[data-procura]');
      nova.focus();
      nova.setSelectionRange(pos, pos);
    });
  });

  ligar(raiz, 'click', '[data-ver]', (e, el) => { filtro = el.dataset.ver; desenhar(raiz); });
  ligar(raiz, 'click', '[data-novo]', async () => { if (await editarCliente(null)) desenhar(raiz); });
  ligar(raiz, 'click', '[data-editar]', async (e, el) => {
    e.stopPropagation();
    if (await editarCliente(Number(el.dataset.editar))) desenhar(raiz);
  });
  ligar(raiz, 'click', 'tr[data-abrir]', (e, el) => {
    if (e.target.closest('[data-editar]')) return;
    location.hash = `#/cliente/${el.dataset.abrir}`;
  });
}

/**
 * O que falta fazer por esta pessoa. Mostra as duas coisas quando ha as duas:
 * escolher so a mais urgente escondia que tambem havia camisolas a entregar.
 */
function faltaFazer(c) {
  const pilulas = [];
  if (c.por_devolver) pilulas.push(`<span class="pilula mau">${c.por_devolver} por devolver</span>`);
  if (c.prontas_para_entregar) pilulas.push(`<span class="pilula ok">${c.prontas_para_entregar} por entregar</span>`);

  // As que nem sequer chegaram sao do fornecedor, nao ha nada a fazer por elas.
  const noFornecedor = c.por_entregar - c.prontas_para_entregar;
  if (noFornecedor > 0) pilulas.push(`<span class="pilula">${noFornecedor} por chegar</span>`);

  return pilulas.length
    ? `<div class="linha-flex nowrap" style="gap:6px">${pilulas.join('')}</div>`
    : '<span class="pequeno dim" style="font-weight:600">Nada</span>';
}

export async function editarCliente(id) {
  const moeda = estado.definicoes.moeda || '€';
  const c = id ? await chamar('clientes.porId', id) : null;
  const padrao = estado.definicoes.margem_padrao || 0;

  return modal({
    titulo: c ? nomeProprio(c.nome) : 'Novo cliente',
    confirmar: c ? 'Guardar alterações' : 'Criar cliente',
    corpo: `
      <div class="grelha-campos">
        <div class="campo"><label>Nome</label><input name="nome" value="${esc(c ? c.nome : '')}" placeholder="Nome e apelido"></div>
        <div class="campo"><label>Contacto</label>
          <input name="contacto" value="${esc(c?.contacto || '')}" placeholder="Telemóvel ou Instagram"></div>
      </div>
      <div class="campo">
        <label>Margem por camisola (${esc(moeda)})</label>
        <input name="margem" style="text-align:right;max-width:180px"
               value="${c && c.margem_override !== null ? valorEuro(c.margem_override) : ''}"
               placeholder="${valorEuro(padrao)}">
        <div class="dica">Vazio usa a margem normal (${eur(padrao, moeda)}). Escreve 0 para vender ao custo —
        como fazes contigo e com a Gabriel/Sara. Vale para as camisolas novas; as que já estão numa encomenda não mudam.</div>
      </div>
      <div class="campo"><label>Notas</label><textarea name="notas" placeholder="Opcional">${esc(c?.notas || '')}</textarea></div>`,
    aoConfirmar: async (m) => {
      const v = (n) => m.querySelector(`[name="${n}"]`).value.trim();
      if (!v('nome')) { aviso('Escreve o nome do cliente.', 'erro', 'Falta o nome'); return false; }
      const dados = {
        nome: v('nome'),
        contacto: v('contacto') || null,
        // Vazio e "usa a margem normal"; 0 e "nao ganho nada". Sao coisas diferentes.
        margem_override: v('margem') === '' ? null : centimos(v('margem')),
        notas: v('notas') || null
      };
      const r = c ? await chamar('clientes.atualizar', c.id, dados) : await chamar('clientes.criar', dados);
      aviso(dados.nome, 'ok', c ? 'Cliente guardado' : 'Cliente criado');
      return r;
    }
  });
}
