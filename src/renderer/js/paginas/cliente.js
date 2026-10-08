import {
  chamar, esc, eur, data, dataLonga, faixa, kpi, vazio, etiquetaChegada, etiquetaEstado,
  fotoMini, icone, iniciais, plural, tamanho, estampa, caixa, nomeProprio, tituloLegivel, ligar, aviso
} from '../util.js';
import { estado } from '../app.js';
import { editarCliente } from './clientes.js';

export async function desenhar(raiz, id) {
  const c = await chamar('clientes.porId', Number(id));
  if (!c) {
    raiz.innerHTML = vazio('clientes', 'Cliente não encontrado', 'Pode ter sido apagado.',
      `<a class="btn" href="#/clientes">${icone('voltar', 16)}Voltar aos clientes</a>`);
    return;
  }
  const historico = await chamar('clientes.historico', c.id);
  const moeda = estado.definicoes.moeda || '€';

  // A mesma pessoa pode aparecer em varias encomendas; agrupa-se para se ler.
  const porEncomenda = new Map();
  for (const l of historico) {
    if (!porEncomenda.has(l.encomenda_id)) {
      porEncomenda.set(l.encomenda_id, {
        id: l.encomenda_id, titulo: l.encomenda_titulo, data: l.encomenda_data, estado: l.encomenda_estado, linhas: []
      });
    }
    porEncomenda.get(l.encomenda_id).linhas.push(l);
  }
  const prontas = historico.filter((l) => !l.entregue && l.estado_chegada === 'chegou');
  const porEntregar = historico.filter((l) => !l.entregue && l.estado_chegada !== 'em_falta');
  const porDevolver = historico.filter((l) => l.estado_chegada === 'em_falta' && !l.devolvida);

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <a class="migalha" href="#/clientes">${icone('voltar', 14)}Clientes</a>
        <div class="linha-flex" style="gap:14px">
          <div class="avatar" style="width:48px;height:48px;font-size:20px">${esc(iniciais(c.nome))}</div>
          <h1>${esc(nomeProprio(c.nome))}</h1>
        </div>
        <div class="sub">
          <span>${esc(c.contacto || 'Sem contacto')}</span>
          <span class="ponto">${c.margem_override === null ? 'Margem normal'
    : c.margem_override === 0 ? 'Vende-se ao custo' : `Margem própria de ${eur(c.margem_override, moeda)}`}</span>
        </div>
      </div>
      <div class="acoes">
        ${prontas.length ? `<button class="btn primario" data-entreguei-tudo>${icone('caixa', 16)}Entreguei ${prontas.length === 1 ? 'a camisola' : `as ${prontas.length}`}</button>` : ''}
        <button class="btn" data-editar>${icone('editar', 16)}Editar cliente</button>
      </div>
    </div>

    ${faixa(
    kpi('Camisolas', c.total_camisolas, plural(c.total_encomendas, 'encomenda', 'encomendas')),
    kpi('Já gastou', eur(c.total_gasto, moeda)),
    kpi('Por receber', eur(c.por_receber, moeda), c.por_receber ? 'a cobrar' : 'está tudo pago', c.por_receber ? 'aviso' : 'ok'),
    kpi('Por entregar', porEntregar.length,
      prontas.length ? `${prontas.length} j\u00e1 c\u00e1 est\u00e3o` : 'nada pronto a sair',
      prontas.length ? 'aviso' : ''),
    porDevolver.length ? kpi('Por devolver', porDevolver.length, 'ao fornecedor', 'mau') : '',
    kpi('Última encomenda', c.ultima_encomenda ? dataLonga(c.ultima_encomenda) : '—')
  )}

    ${c.notas ? `<div style="margin-top:18px">${caixa(`<span style="white-space:pre-wrap">${esc(c.notas)}</span>`, 'info')}</div>` : ''}

    <h2 class="secao">Histórico</h2>
    ${porEncomenda.size ? [...porEncomenda.values()].map((e) => {
    const total = e.linhas.reduce((t, l) => t + (l.preco_cliente || 0), 0);
    const porPagar = e.linhas.filter((l) => !l.pago).reduce((t, l) => t + (l.preco_cliente || 0), 0);
    return `
      <section class="grupo">
        <header>
          <div class="quem">
            <a class="nome" href="#/encomenda/${e.id}">${esc(tituloLegivel(e.titulo))}</a>
            <div class="s"><span>${data(e.data)}</span><span>${plural(e.linhas.length, 'camisola', 'camisolas')}</span><span>${eur(total, moeda)}</span></div>
          </div>
          <div class="dir">
            ${etiquetaEstado(e.estado)}
            ${porPagar ? `<span class="pilula aviso">${eur(porPagar, moeda)} por pagar</span>` : '<span class="pilula ok">Pago</span>'}
          </div>
        </header>
        <table>
          <thead><tr>
            <th style="width:70px"></th><th>Camisola</th><th style="width:80px">Tam.</th>
            <th>Estampagem</th><th style="width:120px">Chegada</th>
            <th style="width:96px" class="meio" title="Entregue ao cliente, ou devolvida ao fornecedor">Sa\u00edda</th>
            <th class="num" style="width:96px">Preço</th><th style="width:100px">Pagamento</th>
          </tr></thead>
          <tbody>
            ${e.linhas.map((l) => `<tr>
              <td>${fotoMini(l.camisola_foto)}</td>
              <td style="font-weight:700">${esc(l.camisola_nome)}</td>
              <td>${tamanho(l.tamanho)}</td>
              <td>${l.personalizacao ? estampa(l.personalizacao_texto) : '<span class="dim">—</span>'}</td>
              <td>${etiquetaChegada(l.estado_chegada)}</td>
              <td class="meio">${l.estado_chegada === 'em_falta'
    ? `<input type="checkbox" class="devolver" data-devolvida="${l.id}" ${l.devolvida ? 'checked' : ''}
             title="J\u00e1 devolvida ao fornecedor">`
    : `<input type="checkbox" data-entregue="${l.id}" ${l.entregue ? 'checked' : ''}
             ${l.estado_chegada === 'chegou' || l.entregue ? '' : 'disabled'}
             title="${l.estado_chegada === 'chegou' || l.entregue ? 'Marcar como entregue' : 'S\u00f3 depois de chegar'}">`}</td>
              <td class="num"><span class="dinheiro">${eur(l.preco_cliente, moeda)}</span></td>
              <td>${l.pago ? '<span class="pilula ok">Pago</span>' : '<span class="pilula aviso">Por pagar</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`;
  }).join('') : `<div class="cartao">${vazio('encomendas', 'Sem encomendas', 'Esta pessoa ainda não pediu nenhuma camisola.')}</div>`}`;

  raiz.querySelector('[data-editar]').addEventListener('click', async () => {
    if (await editarCliente(c.id)) await desenhar(raiz, id);
  });

  ligar(raiz, 'change', '[data-devolvida]', async (e, el) => {
    await chamar('linhas.atualizar', Number(el.dataset.devolvida), { devolvida: el.checked });
    await desenhar(raiz, id);
  });

  ligar(raiz, 'change', '[data-entregue]', async (e, el) => {
    await chamar('linhas.atualizar', Number(el.dataset.entregue), { entregue: el.checked });
    await desenhar(raiz, id);
  });

  raiz.querySelector('[data-entreguei-tudo]')?.addEventListener('click', async () => {
    // Uma a uma: sao poucas, e assim nao e preciso um metodo novo para isto.
    for (const l of prontas) await chamar('linhas.atualizar', l.id, { entregue: true });
    aviso(`${plural(prontas.length, 'camisola entregue', 'camisolas entregues')} a ${nomeProprio(c.nome)}.`, 'ok', 'Entrega registada');
    await desenhar(raiz, id);
  });
}
