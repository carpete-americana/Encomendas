import {
  chamar, esc, eur, centimos, valorEuro, dataLonga, ligar, faixa, kpi, barra, confirmar, modal,
  aviso, fotoMini, icone, iniciais, plural, caixa, vazio, ETIQUETAS_ESTADO, ETIQUETAS_CHEGADA, nomeProprio,
  tituloLegivel, custoEstampagem
} from '../util.js';
import { estado } from '../app.js';
import { autocompletar, sugestaoCamisola, sugestaoCliente } from '../componentes/autocompletar.js';

let atual = null;
// O filtro e a procura sobrevivem aos redesenhos: marcar uma chegada nao pode
// deitar fora o filtro que se estava a usar.
let filtro = 'todas';
let procura = '';

export async function desenhar(raiz, id) {
  const pedido = await chamar('encomendas.porId', Number(id));
  if (!pedido) {
    raiz.innerHTML = vazio('encomendas', 'Encomenda não encontrada', 'Pode ter sido apagada.',
      `<a class="btn" href="#/encomendas">${icone('voltar', 16)}Voltar às encomendas</a>`);
    return;
  }
  if (!atual || atual.id !== pedido.id) { filtro = 'todas'; procura = ''; }
  atual = pedido;
  pintar(raiz);
}

/** Recarrega os dados e volta a pintar, sem mexer na rota nem no scroll. */
async function refrescar(raiz) {
  const scroll = raiz.parentElement.scrollTop;
  atual = await chamar('encomendas.porId', atual.id);
  pintar(raiz);
  raiz.parentElement.scrollTop = scroll;
}

const FILTROS = [
  ['todas', 'Todas', (l) => true],
  ['pendente', 'Por chegar', (l) => l.estado_chegada === 'pendente'],
  ['chegou', 'Chegaram', (l) => l.estado_chegada === 'chegou'],
  ['por_entregar', 'Por entregar', (l) => !l.entregue && l.estado_chegada === 'chegou'],
  ['entregue', 'Entregues', (l) => l.entregue],
  ['em_falta', 'Por devolver', (l) => l.estado_chegada === 'em_falta' && !l.devolvida],
  ['devolvida', 'Devolvidas', (l) => l.devolvida],
  ['errada', 'Erradas', (l) => l.estado_chegada === 'errada'],
  ['por_pagar', 'Por pagar', (l) => !l.pago]
];

function pintar(raiz) {
  const moeda = estado.definicoes.moeda || '€';
  const t = atual.totais;

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <a class="migalha" href="#/encomendas">${icone('voltar', 14)}Encomendas</a>
        <h1 contenteditable="plaintext-only" spellcheck="false" data-titulo title="Clica para mudar o título">${esc(tituloLegivel(atual.titulo))}</h1>
        <div class="sub">
          <span class="linha-flex" style="gap:6px">${icone('relogio', 14)}${dataLonga(atual.data)}</span>
          ${atual.fornecedor ? `<span class="ponto">${esc(atual.fornecedor)}</span>` : ''}
          <span class="ponto">${plural(atual.grupos.length, 'cliente', 'clientes')}</span>
        </div>
      </div>
      <div class="acoes">
        <select data-estado style="width:auto" title="Estado da encomenda">
          ${Object.entries(ETIQUETAS_ESTADO).map(([k, [, texto]]) =>
    `<option value="${k}" ${k === atual.estado ? 'selected' : ''}>${esc(texto)}</option>`).join('')}
        </select>
        <button class="btn" data-editar>${icone('editar', 16)}Detalhes</button>
        <button class="btn primario" data-exportar ${t.nCamisolas ? '' : 'disabled'}>${icone('folha', 16)}Exportar Excel</button>
      </div>
    </div>

    ${faixa(
    kpi('Camisolas', t.nCamisolas, plural(atual.grupos.length, 'cliente', 'clientes')),
    kpi('Fornecedor', eur(t.totalFornecedor, moeda), 'o que pagas'),
    kpi('Clientes', eur(t.totalCliente, moeda), 'o que cobras'),
    kpi('Lucro', eur(t.lucro, moeda), `${eur(t.lucroMedio, moeda)} por camisola`, 'ok'),
    kpi('Chegadas', `${t.chegaram}<small>/${t.nCamisolas}</small>`, `${t.percentagemChegadas}%`,
      t.nCamisolas && t.percentagemChegadas === 100 ? 'ok' : '', `<div class="mini-barra">${barra(t.percentagemChegadas)}</div>`),
    kpi('Entregues', `${t.entregues}<small>/${t.nCamisolas}</small>`,
      t.prontasParaEntregar ? `${t.prontasParaEntregar} prontas para entregar` : 'nada pronto a sair',
      t.nCamisolas && t.entregues === t.nCamisolas ? 'ok' : t.prontasParaEntregar ? 'aviso' : ''),
    kpi('Por receber', eur(t.porReceber, moeda), `${t.nCamisolas - t.paraDevolver - t.nPagas} por pagar`, t.porReceber ? 'aviso' : 'ok'),
    t.paraDevolver ? kpi('Por devolver', t.porDevolver,
      t.porDevolver
        ? `${eur(t.devolverAoFornecedor, moeda)} a recuperar`
        : `${plural(t.devolvidas, 'j\u00e1 devolvida', 'j\u00e1 devolvidas')}`,
      t.porDevolver ? 'mau' : 'ok') : ''
  )}

    ${t.aReembolsar && t.porDevolver ? `<div style="margin-top:16px">${caixa(
    `<b>${plural(t.paraDevolver, 'camisola vai de volta', 'camisolas v\u00e3o de volta')} ao fornecedor</b>, e
     ${eur(t.aReembolsar, moeda)} j\u00e1 tinham sido pagos pelos clientes. Esse dinheiro \u00e9 para devolver.`)}</div>` : ''}

    ${t.nCamisolas ? resumo(moeda) : ''}

    <div class="cartao form-adicionar" data-form style="margin-top:16px">
      <div class="cartao-titulo" style="margin-bottom:12px">${icone('mais', 16)}Adicionar camisola</div>
      <div class="linha-form">
        <div class="campo"><label>Cliente</label>
          <input name="cliente" placeholder="Nome" autocomplete="off"><input type="hidden" name="cliente_id">
          <input type="hidden" name="cliente_margem"></div>
        <div class="campo"><label>Camisola</label>
          <input name="camisola" placeholder="Procura no catálogo ou escreve uma nova" autocomplete="off"><input type="hidden" name="camisola_id"></div>
        <div class="campo"><label>Tamanho</label>
          <input name="tamanho" list="lista-tamanhos" placeholder="L" style="text-transform:uppercase">
          <datalist id="lista-tamanhos">${estado.tamanhos.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="campo"><label>Personalização</label>
          <select name="personalizacao"><option value="0">Não</option><option value="1">Sim</option></select></div>
        <div class="campo"><label>Nome · número · símbolo</label>
          <input name="texto" placeholder="Ronaldo - 7 - Badge" disabled></div>
        <div class="campo"><label>Fornecedor (${esc(moeda)})</label>
          <input name="preco" placeholder="10,00" style="text-align:right"></div>
        <button class="btn primario" data-adicionar style="height:38px">${icone('mais', 16)}Adicionar</button>
      </div>
      <div class="pista" data-pista>${icone('info', 14)}<span></span></div>
    </div>

    ${t.nCamisolas ? `
    <div class="barra-ferramentas" style="margin-top:22px">
      <div class="com-icone">${icone('procurar', 16)}<input type="search" data-procura placeholder="Procurar camisola, cliente ou nome" value="${esc(procura)}"></div>
      <div class="segmentos">
        ${FILTROS.map(([k, texto, f]) => {
    const n = atual.linhas.filter(f).length;
    if (k !== 'todas' && k !== filtro && !n) return '';
    return `<button data-filtro="${k}" class="${filtro === k ? 'ativo' : ''}">${texto} <span class="n">${n}</span></button>`;
  }).join('')}
      </div>
      <div class="espaco"></div>
      <span class="pequeno dim" data-contagem></span>
    </div>` : ''}

    <div style="margin-top:${t.nCamisolas ? 0 : 20}px">
      <div data-grupos>
        ${atual.grupos.length ? atual.grupos.map((g) => grupo(g, moeda)).join('')
    : `<div class="cartao">${vazio('camisola', 'Ainda sem camisolas',
      'Escreve o cliente e a camisola lá em cima. Uma camisola que ainda não exista fica guardada no catálogo para a próxima vez.')}</div>`}
        <div class="cartao" data-sem-resultados style="display:none">
          ${vazio('procurar', 'Nada corresponde', 'Nenhuma camisola bate com a procura e o filtro escolhidos.')}
        </div>
      </div>
    </div>`;

  ligarEventos(raiz);
  aplicarFiltro(raiz);
}

/** Chegadas, tamanhos e pagamentos lado a lado, logo por baixo dos numeros. */
function resumo(moeda) {
  const t = atual.totais;
  const partes = [
    ['chegou', t.chegaram], ['errada', t.erradas], ['em_falta', t.emFalta], ['pendente', t.pendentes]
  ];

  return `
    <div class="resumo-enc quatro">
      <div class="bloco">
        <div class="bloco-titulo">Chegadas <span>${t.percentagemChegadas}%</span></div>
        <div class="empilhada">
          ${partes.map(([k, n]) => (n ? `<i style="width:${(n / t.nCamisolas) * 100}%;background:${ETIQUETAS_CHEGADA[k][2]}"></i>` : '')).join('')}
        </div>
        <div class="legenda">
          ${partes.map(([k, n]) => `<span style="--c:${ETIQUETAS_CHEGADA[k][2]}">${ETIQUETAS_CHEGADA[k][1]}</span><b>${n}</b>`).join('')}
        </div>
      </div>

      <div class="bloco">
        <div class="bloco-titulo">Por tamanho <span>${plural(atual.tamanhos.length, 'tamanho', 'tamanhos')}</span></div>
        <div class="contagem-tam">
          ${atual.tamanhos.map((x) => `<div>
            <span class="tam${x.tamanho === '—' ? ' sem' : ''}">${esc(x.tamanho === '—' ? '?' : x.tamanho)}</span><b>${x.total}</b>
          </div>`).join('')}
        </div>
      </div>

      <div class="bloco">
        <div class="bloco-titulo">Entregas <span>${t.entregues}/${t.nCamisolas} entregues</span></div>
        <div class="empilhada">
          ${t.nCamisolas ? `<i style="width:${(t.entregues / t.nCamisolas) * 100}%;background:var(--acento)"></i>
            <i style="width:${(t.prontasParaEntregar / t.nCamisolas) * 100}%;background:var(--ok)"></i>` : ''}
        </div>
        <div class="legenda">
          <span style="--c:var(--acento)">Entregues</span><b>${t.entregues}</b>
          <span style="--c:var(--ok)">Prontas a entregar</span><b>${t.prontasParaEntregar}</b>
        </div>
      </div>

      <div class="bloco">
        <div class="bloco-titulo">Pagamentos <span>${t.nPagas}/${t.nCamisolas} pagas</span></div>
        <div class="empilhada">
          ${t.totalCliente ? `<i style="width:${(t.recebido / t.totalCliente) * 100}%;background:var(--ok)"></i>
            <i style="width:${(t.porReceber / t.totalCliente) * 100}%;background:var(--aviso)"></i>` : ''}
        </div>
        <div class="legenda">
          <span style="--c:var(--ok)">Recebido</span><b>${eur(t.recebido, moeda)}</b>
          <span style="--c:var(--aviso)">Por receber</span><b>${eur(t.porReceber, moeda)}</b>
        </div>
      </div>
    </div>
    ${atual.notas ? `<div style="margin-top:16px">${caixa(`<span style="white-space:pre-wrap">${esc(atual.notas)}</span>`, 'info')}</div>` : ''}`;
}

function grupo(g, moeda) {
  const t = g.totais;
  return `
    <section class="grupo" data-grupo="${g.cliente_id}">
      <header>
        <div class="avatar">${esc(iniciais(g.cliente_nome))}</div>
        <div class="quem">
          <a class="nome" href="#/cliente/${g.cliente_id}">${esc(nomeProprio(g.cliente_nome))}</a>
          <div class="s">
            <span>${plural(t.nCamisolas, 'camisola', 'camisolas')}</span>
            <span>${eur(t.totalCliente, moeda)}</span>
            ${t.porReceber ? `<span style="color:var(--aviso)">${eur(t.porReceber, moeda)} por receber</span>` : '<span style="color:var(--ok)">Pago</span>'}
          </div>
        </div>
        <div class="dir">
          <div class="prog">${barra(t.percentagemChegadas)}<span>${t.chegaram}/${t.nCamisolas}</span></div>
          <button class="btn pequeno" data-bloco-chegou="${g.cliente_id}" ${t.pendentes ? '' : 'disabled'}
                  title="Marca como chegadas só as que estão por chegar">${icone('visto', 15)}Tudo chegou</button>
          <button class="btn pequeno" data-bloco-entregue="${g.cliente_id}" ${t.prontasParaEntregar ? '' : 'disabled'}
                  title="Marca como entregues as que já chegaram">${icone('caixa', 15)}Entreguei tudo</button>
          ${t.porDevolver ? `<button class="btn pequeno" data-bloco-devolvido="${g.cliente_id}"
                  title="Marca como devolvidas as que v\u00e3o de volta">${icone('voltar', 15)}Devolvi tudo</button>` : ''}
          <button class="btn pequeno" data-bloco-pago="${g.cliente_id}" ${t.nPagas === t.nCamisolas ? 'disabled' : ''}>${icone('euro', 15)}Tudo pago</button>
          <button class="btn fantasma icone pequeno" data-pre-cliente="${g.cliente_id}" title="Adicionar camisola a ${esc(nomeProprio(g.cliente_nome))}">${icone('mais', 16)}</button>
        </div>
      </header>
      <table class="tabela-linhas">
        <thead><tr>
          <th style="width:66px"></th><th>Camisola</th><th style="width:66px">Tam.</th>
          <th style="width:52px" class="meio">Pers.</th><th style="width:136px">Estampagem</th>
          <th style="width:78px" class="num">Fornec.</th><th style="width:78px" class="num">Cliente</th>
          <th style="width:58px" class="num">Lucro</th>
          <th style="width:128px">Chegada</th>
          <th style="width:58px" class="meio" title="Entregue ao cliente, ou devolvida ao fornecedor">Saída</th><th style="width:46px" class="meio">Pago</th>
          <th style="width:70px"></th>
        </tr></thead>
        <tbody>${g.linhas.map((l) => linhaHtml(l, moeda)).join('')}</tbody>
      </table>
    </section>`;
}

function linhaHtml(l, moeda) {
  const lucro = (l.preco_cliente || 0) - (l.preco_fornecedor || 0);
  const classe = [
    { chegou: 'linha-chegou', em_falta: 'linha-devolver', errada: 'linha-errada' }[l.estado_chegada] || '',
    l.entregue ? 'linha-entregue' : '',
    l.devolvida ? 'linha-devolvida' : ''
  ].filter(Boolean).join(' ');
  const procuravel = [l.camisola_nome, l.cliente_nome, l.personalizacao_texto, l.tamanho].join(' ').toLowerCase();
  const entregueAttr = l.entregue ? '1' : '0';

  return `
    <tr data-linha="${l.id}" class="${classe}" data-procura="${esc(procuravel)}"
        data-chegada="${l.estado_chegada}" data-pago="${l.pago ? 1 : 0}" data-entregue="${entregueAttr}"
        data-devolvida="${l.devolvida ? 1 : 0}">
      <td>${fotoMini(l.camisola_foto)}</td>
      <td class="cam-nome">${esc(l.camisola_nome)}${l.camisola_equipa ? `<small>${esc(l.camisola_equipa)}</small>` : ''}</td>
      <td><input class="editavel tam-in" data-campo="tamanho" value="${esc(l.tamanho || '')}" list="lista-tamanhos" placeholder="?" title="Tamanho"></td>
      <td class="meio"><input type="checkbox" data-campo="personalizacao" ${l.personalizacao ? 'checked' : ''} title="Personalização"></td>
      <td><input class="editavel estampa-in" data-campo="personalizacao_texto" value="${esc(l.personalizacao_texto || '')}"
                 placeholder="${l.personalizacao ? 'Nome - número' : '—'}" ${l.personalizacao ? '' : 'disabled'}></td>
      <td class="num"><input class="editavel num" data-campo="preco_fornecedor" value="${valorEuro(l.preco_fornecedor)}" title="Preço do fornecedor"></td>
      <td class="num"><input class="editavel num" data-campo="preco_cliente" value="${valorEuro(l.preco_cliente)}" title="Preço ao cliente"></td>
      <td class="num"><span class="dinheiro ${lucro > 0 ? 'ok' : lucro < 0 ? 'aviso' : 'dim'}" style="font-size:15px">${eur(lucro, moeda)}</span></td>
      <td>
        <select class="estado" data-campo="estado_chegada" data-v="${l.estado_chegada}">
          ${Object.entries(ETIQUETAS_CHEGADA).map(([k, [, texto]]) =>
    `<option value="${k}" ${k === l.estado_chegada ? 'selected' : ''}>${esc(texto)}</option>`).join('')}
        </select>
      </td>
      <td class="meio">${l.estado_chegada === 'em_falta'
    ? `<input type="checkbox" class="devolver" data-campo="devolvida" ${l.devolvida ? 'checked' : ''}
             title="J\u00e1 devolvida ao fornecedor">`
    : `<input type="checkbox" data-campo="entregue" ${l.entregue ? 'checked' : ''}
             ${l.estado_chegada === 'chegou' || l.entregue ? '' : 'disabled'}
             title="${l.estado_chegada === 'chegou' || l.entregue ? 'J\u00e1 foi para o dono' : 'S\u00f3 depois de chegar'}">`}</td>
      <td class="meio"><input type="checkbox" data-campo="pago" ${l.pago ? 'checked' : ''} title="Pago"></td>
      <td>
        <div class="acoes-linha">
          <button class="btn fantasma icone pequeno" data-duplicar title="Duplicar (outro tamanho, por exemplo)">${icone('copiar', 16)}</button>
          <button class="btn fantasma perigo icone pequeno" data-apagar-linha title="Tirar da encomenda">${icone('lixo', 16)}</button>
        </div>
      </td>
    </tr>`;
}

/** Esconde linhas e grupos que nao passam a procura nem o filtro, sem redesenhar. */
function aplicarFiltro(raiz) {
  const teste = (FILTROS.find(([k]) => k === filtro) || FILTROS[0])[2];
  const termo = procura.trim().toLowerCase();
  let visiveis = 0;

  for (const g of raiz.querySelectorAll('[data-grupo]')) {
    let noGrupo = 0;
    for (const tr of g.querySelectorAll('[data-linha]')) {
      const l = {
        estado_chegada: tr.dataset.chegada,
        pago: tr.dataset.pago === '1',
        entregue: tr.dataset.entregue === '1',
        devolvida: tr.dataset.devolvida === '1'
      };
      const passa = teste(l) && (!termo || tr.dataset.procura.includes(termo));
      tr.classList.toggle('escondida', !passa);
      if (passa) noGrupo += 1;
    }
    g.classList.toggle('escondido', noGrupo === 0);
    visiveis += noGrupo;
  }

  const semResultados = raiz.querySelector('[data-sem-resultados]');
  if (semResultados) semResultados.style.display = atual.linhas.length && !visiveis ? '' : 'none';
  const contagem = raiz.querySelector('[data-contagem]');
  if (contagem) {
    contagem.textContent = visiveis === atual.linhas.length
      ? plural(visiveis, 'camisola', 'camisolas')
      : `${visiveis} de ${atual.linhas.length} camisolas`;
  }
}

function ligarEventos(raiz) {
  const moeda = estado.definicoes.moeda || '€';
  const form = raiz.querySelector('[data-form]');
  const campo = (n) => form.querySelector(`[name="${n}"]`);

  autocompletar(campo('cliente'), {
    procurar: (texto) => chamar('clientes.listar', { procura: texto }),
    desenhar: sugestaoCliente,
    permitirNovo: true,
    textoNovo: 'Novo cliente',
    aoEscolher: (item) => {
      if (item.novo) { campo('cliente').value = item.novo; campo('cliente_id').value = ''; }
      else {
        campo('cliente').value = nomeProprio(item.nome);
        campo('cliente_id').value = item.id;
        campo('cliente_margem').value = item.margem_override ?? '';
      }
      campo('camisola').focus();
    }
  });
  // Escrever por cima de um cliente escolhido desliga-o: senao o id antigo
  // mandava e o nome novo era ignorado.
  campo('cliente').addEventListener('input', () => {
    campo('cliente_id').value = '';
    campo('cliente_margem').value = '';
  });

  autocompletar(campo('camisola'), {
    procurar: (texto) => chamar('camisolas.listar', { procura: texto, ordem: texto ? 'nome' : 'populares' }),
    desenhar: (c) => sugestaoCamisola(c, moeda),
    permitirNovo: true,
    textoNovo: 'Nova camisola',
    aoEscolher: (item) => {
      if (item.novo) {
        campo('camisola').value = item.novo;
        campo('camisola_id').value = '';
      } else {
        campo('camisola').value = item.nome;
        campo('camisola_id').value = item.id;
        if (item.preco_fornecedor !== null) campo('preco').value = valorEuro(item.preco_fornecedor);
      }
      campo('tamanho').focus();
    }
  });
  campo('camisola').addEventListener('input', () => { campo('camisola_id').value = ''; });

  // O campo do nome so abre com personalizacao ligada: escrito com ela
  // desligada nao ia parar ao Excel, e ninguem percebia porque.
  campo('personalizacao').addEventListener('change', (e) => {
    const ligado = e.target.value === '1';
    campo('texto').disabled = !ligado;
    if (!ligado) campo('texto').value = '';
    else campo('texto').focus();
  });

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !form.querySelector('.sugestoes .marcada')) {
      e.preventDefault();
      adicionar();
    }
  });
  form.querySelector('[data-adicionar]').addEventListener('click', adicionar);

  async function adicionar() {
    const nomeCliente = campo('cliente').value.trim();
    const nomeCamisola = campo('camisola').value.trim();
    if (!nomeCliente) { aviso('Escreve de quem é a camisola.', 'erro', 'Falta o cliente'); campo('cliente').focus(); return; }
    if (!nomeCamisola) { aviso('Escreve ou escolhe a camisola.', 'erro', 'Falta a camisola'); campo('camisola').focus(); return; }

    await chamar('linhas.adicionar', atual.id, {
      cliente_id: campo('cliente_id').value ? Number(campo('cliente_id').value) : null,
      cliente_nome: nomeCliente,
      camisola_id: campo('camisola_id').value ? Number(campo('camisola_id').value) : null,
      camisola_nome: nomeCamisola,
      tamanho: campo('tamanho').value.trim().toUpperCase() || null,
      personalizacao: campo('personalizacao').value === '1',
      personalizacao_texto: campo('texto').value.trim() || null,
      preco_fornecedor: centimos(campo('preco').value)
    });

    // O cliente fica: quase sempre e a mesma pessoa a pedir varias de seguida.
    const cliente = campo('cliente').value;
    const clienteId = campo('cliente_id').value;
    const margemCliente = campo('cliente_margem').value;
    await refrescar(raiz);
    const f = raiz.querySelector('[data-form]');
    f.querySelector('[name="cliente"]').value = cliente;
    f.querySelector('[name="cliente_id"]').value = clienteId;
    f.querySelector('[name="cliente_margem"]').value = margemCliente;
    f.querySelector('[name="camisola"]').focus();
    aviso(`${nomeCamisola} para ${nomeCliente}.`, 'ok', 'Camisola adicionada');
  }

  // A conta a vista enquanto se escreve: camisola + estampagem + margem.
  function atualizarPista() {
    const d = estado.definicoes;
    const personalizacao = campo('personalizacao').value === '1';
    const extra = custoEstampagem(campo('texto').value, {
      personalizacao,
      nomeNumero: d.estampagem_nome_numero || 0,
      soUm: d.estampagem_so_um || 0
    });
    const margemCliente = campo('cliente_margem').value;
    const margem = margemCliente === '' ? (d.margem_padrao || 0) : Number(margemCliente);
    const base = centimos(campo('preco').value);

    const alvo = form.querySelector('[data-pista] span');
    if (base === null) {
      alvo.textContent = personalizacao
        ? `A estampagem custa mais ${eur(extra, moeda)} ao fornecedor. Escreve o preço da camisola para ver a conta.`
        : 'Escolhe a camisola e o preço aparece sozinho, se já estiver no catálogo.';
      return;
    }

    const fornecedor = base + extra;
    alvo.textContent =
      `Camisola ${eur(base, moeda)}${extra ? ` + estampagem ${eur(extra, moeda)}` : ''}`
      + ` = ${eur(fornecedor, moeda)} ao fornecedor · + margem ${eur(margem, moeda)}`
      + ` = ${eur(fornecedor + margem, moeda)} ao cliente.`;
  }

  for (const nome of ['preco', 'texto', 'personalizacao', 'cliente_margem']) {
    campo(nome).addEventListener('input', atualizarPista);
    campo(nome).addEventListener('change', atualizarPista);
  }
  atualizarPista();

  // ---- procura e filtros
  const caixaProcura = raiz.querySelector('[data-procura]');
  caixaProcura?.addEventListener('input', () => { procura = caixaProcura.value; aplicarFiltro(raiz); });
  ligar(raiz, 'click', '[data-filtro]', (e, el) => {
    filtro = el.dataset.filtro;
    raiz.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('ativo', b === el));
    aplicarFiltro(raiz);
  });

  // ---- edicao das linhas
  ligar(raiz, 'change', '[data-campo]', async (e, el) => {
    const tr = el.closest('[data-linha]');
    if (!tr) return;
    const nome = el.dataset.campo;

    let valor;
    if (el.type === 'checkbox') valor = el.checked;
    else if (nome === 'preco_fornecedor' || nome === 'preco_cliente') valor = centimos(el.value) ?? 0;
    else if (nome === 'tamanho') valor = el.value.trim().toUpperCase() || null;
    else valor = el.value.trim() || null;

    await chamar('linhas.atualizar', Number(tr.dataset.linha), { [nome]: valor });
    await refrescar(raiz);
  });

  // Enter num campo da linha grava logo, como sair do campo.
  ligar(raiz, 'keydown', '.editavel', (e, el) => { if (e.key === 'Enter') el.blur(); });

  ligar(raiz, 'click', '[data-duplicar]', async (e, el) => {
    await chamar('linhas.duplicar', Number(el.closest('[data-linha]').dataset.linha));
    await refrescar(raiz);
    aviso('A cópia ficou logo abaixo, por chegar e por pagar.', 'ok', 'Linha duplicada');
  });

  ligar(raiz, 'click', '[data-apagar-linha]', async (e, el) => {
    const tr = el.closest('[data-linha]');
    const linha = atual.linhas.find((l) => l.id === Number(tr.dataset.linha));
    const ok = await confirmar('Tirar da encomenda?',
      `<b>${esc(linha.camisola_nome)}</b> de ${esc(nomeProprio(linha.cliente_nome))} sai desta encomenda. A camisola continua no catálogo.`,
      { confirmar: 'Tirar da encomenda' });
    if (!ok) return;
    await chamar('linhas.apagar', linha.id);
    await refrescar(raiz);
  });

  ligar(raiz, 'click', '[data-bloco-chegou]', async (e, el) => {
    // So mexe no que esta por chegar: um "em falta" ou um "entregue" marcados
    // a mao nao podem ser desfeitos por este botao.
    const n = await chamar('linhas.marcarBloco', atual.id, Number(el.dataset.blocoChegou),
      { estado_chegada: 'chegou', apenas: ['pendente'] });
    await refrescar(raiz);
    aviso(`${plural(n, 'camisola passou', 'camisolas passaram')} a chegada.`, 'ok');
  });

  ligar(raiz, 'click', '[data-bloco-entregue]', async (e, el) => {
    // So o que ja chegou pode ser entregue.
    const n = await chamar('linhas.marcarBloco', atual.id, Number(el.dataset.blocoEntregue),
      { entregue: true, apenas: ['chegou'] });
    await refrescar(raiz);
    aviso(`${plural(n, 'camisola entregue', 'camisolas entregues')}.`, 'ok');
  });

  ligar(raiz, 'click', '[data-bloco-devolvido]', async (e, el) => {
    const n = await chamar('linhas.marcarBloco', atual.id, Number(el.dataset.blocoDevolvido),
      { devolvida: true, apenas: ['em_falta'] });
    await refrescar(raiz);
    aviso(`${plural(n, 'camisola devolvida', 'camisolas devolvidas')} ao fornecedor.`, 'ok');
  });

  ligar(raiz, 'click', '[data-bloco-pago]', async (e, el) => {
    await chamar('linhas.marcarBloco', atual.id, Number(el.dataset.blocoPago), { pago: true });
    await refrescar(raiz);
  });

  ligar(raiz, 'click', '[data-pre-cliente]', (e, el) => {
    const g = atual.grupos.find((x) => x.cliente_id === Number(el.dataset.preCliente));
    campo('cliente').value = nomeProprio(g.cliente_nome);
    campo('cliente_id').value = g.cliente_id;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => campo('camisola').focus(), 250);
  });

  // ---- cabecalho
  raiz.querySelector('[data-estado]').addEventListener('change', async (e) => {
    await chamar('encomendas.atualizar', atual.id, { estado: e.target.value });
    await refrescar(raiz);
  });

  const titulo = raiz.querySelector('[data-titulo]');
  titulo.addEventListener('blur', async () => {
    const novo = titulo.textContent.trim();
    // Compara com o que esta no ecra: o titulo pode estar mostrado em minusculas,
    // e sair do campo sem mexer nao pode reescrever o que esta gravado.
    if (novo && novo !== tituloLegivel(atual.titulo)) {
      await chamar('encomendas.atualizar', atual.id, { titulo: novo });
      atual.titulo = novo;
    } else {
      titulo.textContent = tituloLegivel(atual.titulo);
    }
  });
  titulo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titulo.blur(); }
    if (e.key === 'Escape') { titulo.textContent = tituloLegivel(atual.titulo); titulo.blur(); }
  });

  raiz.querySelector('[data-editar]').addEventListener('click', () => editarDetalhes(raiz));
  raiz.querySelector('[data-exportar]').addEventListener('click', () => exportar());
}

async function editarDetalhes(raiz) {
  const r = await modal({
    titulo: 'Detalhes da encomenda',
    confirmar: 'Guardar alterações',
    corpo: `
      <div class="grelha-campos">
        <div class="campo"><label>Data</label><input name="data" type="date" value="${esc(atual.data)}"></div>
        <div class="campo"><label>Fornecedor</label><input name="fornecedor" value="${esc(atual.fornecedor || '')}" placeholder="Opcional"></div>
      </div>
      <div class="campo"><label>Título</label><input name="titulo" value="${esc(atual.titulo)}"></div>
      <div class="campo"><label>Notas</label><textarea name="notas" placeholder="Só para ti; não sai no Excel">${esc(atual.notas || '')}</textarea></div>`,
    aoConfirmar: (m) => {
      const v = (n) => m.querySelector(`[name="${n}"]`).value.trim();
      return chamar('encomendas.atualizar', atual.id, {
        data: v('data'), titulo: v('titulo') || atual.titulo, fornecedor: v('fornecedor') || null, notas: v('notas') || null
      });
    }
  });
  if (r) await refrescar(raiz);
}

async function exportar() {
  const r = await chamar('exportar.encomenda', atual.id, { perguntar: true });
  if (!r) return;

  await modal({
    titulo: 'Excel pronto para o fornecedor',
    confirmar: 'Mostrar na pasta',
    cancelar: 'Fechar',
    corpo: `
      ${caixa(`<b>${plural(r.camisolas, 'camisola', 'camisolas')} de ${plural(r.clientes, 'cliente', 'clientes')}</b>, ${(r.bytes / 1024).toFixed(0)} KB.
        Sem preços nem contas — só a lista de produção.`, 'ok')}
      <div class="campo"><label>Ficheiro</label>
        <div class="pequeno" style="word-break:break-all;color:var(--tinta-2);font-weight:600">${esc(r.caminho)}</div></div>
      ${r.semFoto.length ? caixa(`${plural(r.semFoto.length, 'camisola foi', 'camisolas foram')} sem foto:<br>${r.semFoto.map(esc).join('<br>')}`) : ''}`,
    aoConfirmar: () => chamar('exportar.mostrarNaPasta', r.caminho)
  });
}

