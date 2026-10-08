import {
  chamar, esc, eur, data, ligar, vazio, modal, confirmar, aviso, fotoUrl, centimos, valorEuro,
  icone, plural, tamanho, estampa, nomeProprio, fotoMini, caixa
} from '../util.js';
import { estado } from '../app.js';

const filtros = { procura: '', ordem: 'populares', incluirArquivadas: false };
const ORDENS = [['populares', 'Mais pedidas'], ['nome', 'A–Z'], ['recentes', 'Recentes'], ['preco', 'Preço']];

export async function desenhar(raiz) {
  const lista = await chamar('camisolas.listar', filtros);
  const comEstampagem = (await chamar('camisolas.precosComEstampagem')) || [];
  const moeda = estado.definicoes.moeda || '€';
  const nunca = lista.filter((c) => !c.vezes_encomendada).length;
  const semFoto = lista.filter((c) => !c.foto).length;
  const semPreco = lista.filter((c) => c.preco_fornecedor === null).length;

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Catálogo</h1>
        <div class="sub"><span>${plural(lista.length, 'camisola guardada', 'camisolas guardadas')}</span>
          <span class="ponto">Cada camisola escrita numa encomenda fica aqui para a próxima vez</span></div>
      </div>
      <div class="acoes">
        <button class="btn" data-juntar-tudo title="Junta camisolas repetidas com nomes diferentes">${icone('copiar', 16)}Juntar repetidas</button>
        <button class="btn" data-limpar-fotos title="Apaga ficheiros de foto que nenhuma camisola usa">${icone('arquivo', 16)}Limpar fotos soltas</button>
        <button class="btn primario" data-nova>${icone('mais', 16)}Nova camisola</button>
      </div>
    </div>

    ${comEstampagem.length ? `<div style="margin-bottom:18px">${caixa(
    `<b>${plural(comEstampagem.length, 'camisola tem', 'camisolas t\u00eam')} o pre\u00e7o com a estampagem l\u00e1 dentro.</b>
     Vieram dos Excel antigos, onde s\u00f3 foram pedidas personalizadas. Se as pedires outra vez com nome e n\u00famero,
     a estampagem seria somada duas vezes.
     <button class="btn pequeno" data-rever-precos style="margin-top:10px">Rever pre\u00e7os</button>`)}</div>` : ''}

    <div class="barra-ferramentas">
      <div class="com-icone">${icone('procurar', 16)}<input type="search" data-procura placeholder="Procurar por nome ou equipa" value="${esc(filtros.procura)}"></div>
      <div class="segmentos">
        ${ORDENS.map(([k, t]) => `<button data-ordem="${k}" class="${filtros.ordem === k ? 'ativo' : ''}">${t}</button>`).join('')}
      </div>
      <label class="linha-flex pequeno" style="gap:8px;font-weight:700;color:var(--tinta-2);cursor:pointer">
        <input type="checkbox" data-arquivadas ${filtros.incluirArquivadas ? 'checked' : ''}> Mostrar arquivadas
      </label>
      <div class="espaco"></div>
      <div class="linha-flex" style="gap:6px">
        ${nunca ? `<span class="pilula">${nunca} nunca pedida${nunca === 1 ? '' : 's'}</span>` : ''}
        ${semFoto ? `<span class="pilula aviso">${semFoto} sem foto</span>` : ''}
        ${semPreco ? `<span class="pilula aviso">${semPreco} sem preço</span>` : ''}
      </div>
    </div>

    ${lista.length ? `<div class="grelha-catalogo">${lista.map((c) => cartao(c, moeda)).join('')}</div>`
    : `<div class="cartao">${vazio('camisola', filtros.procura ? 'Nada com esse nome' : 'Catálogo vazio',
      filtros.procura ? 'Nenhuma camisola bate com essa procura. Experimenta só a equipa ou o ano.'
        : 'Importa o Excel antigo ou escreve uma camisola numa encomenda — fica guardada sozinha.',
      filtros.procura ? '' : `<button class="btn primario" data-nova>${icone('mais', 16)}Nova camisola</button>`)}</div>`}`;

  const procura = raiz.querySelector('[data-procura]');
  let temporizador;
  procura.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      filtros.procura = procura.value;
      const pos = procura.selectionStart;
      await desenhar(raiz);
      const novo = raiz.querySelector('[data-procura]');
      novo.focus();
      novo.setSelectionRange(pos, pos);
    }, 180);
  });

  ligar(raiz, 'click', '[data-ordem]', (e, el) => { filtros.ordem = el.dataset.ordem; desenhar(raiz); });
  raiz.querySelector('[data-arquivadas]').addEventListener('change', (e) => {
    filtros.incluirArquivadas = e.target.checked;
    desenhar(raiz);
  });

  ligar(raiz, 'click', '[data-nova]', async () => {
    if (await editarCamisola(null)) desenhar(raiz);
  });

  raiz.querySelector('[data-limpar-fotos]').addEventListener('click', async () => {
    const n = await chamar('camisolas.limparFotosOrfas');
    aviso(n ? `${plural(n, 'ficheiro apagado', 'ficheiros apagados')} da pasta das fotos.` : 'Não havia nenhuma foto solta.', 'ok', 'Fotos limpas');
  });

  ligar(raiz, 'click', '[data-abrir]', async (e, el) => {
    if (await editarCamisola(Number(el.dataset.abrir))) desenhar(raiz);
  });

  ligar(raiz, 'click', '[data-rever-precos]', async () => {
    if (await reverPrecos(comEstampagem)) desenhar(raiz);
  });

  ligar(raiz, 'click', '[data-juntar-tudo]', async () => {
    if (await juntarCamisolas(null)) desenhar(raiz);
  });
}

/**
 * Junta duas ou mais camisolas numa so. Serve para os enganos nos nomes dos
 * Excel antigos, em que a mesma camisola entrou duas vezes escrita de maneiras
 * diferentes. As linhas das encomendas passam todas para a que fica.
 */
export async function juntarCamisolas(idInicial) {
  const moeda = estado.definicoes.moeda || '\u20ac';
  const todas = await chamar('camisolas.listar', { incluirArquivadas: true, ordem: 'nome' });
  if (todas.length < 2) {
    aviso('E preciso ter pelo menos duas camisolas no catalogo.', 'erro', 'Nada para juntar');
    return null;
  }

  const escolhidas = new Set(idInicial ? [Number(idInicial)] : []);
  let fica = idInicial ? Number(idInicial) : null;

  const linha = (c) => `
    <label class="junta-linha${escolhidas.has(c.id) ? ' marcada' : ''}">
      <input type="checkbox" data-escolher="${c.id}" ${escolhidas.has(c.id) ? 'checked' : ''}>
      ${fotoMini(c.foto)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">${esc(c.nome)}</div>
        <div class="pequeno dim" style="font-weight:600">
          ${c.vezes_encomendada ? plural(c.vezes_encomendada, 'linha de encomenda', 'linhas de encomenda') : 'Nunca pedida'}
          ${c.preco_fornecedor !== null ? ` \u00b7 ${eur(c.preco_fornecedor, moeda)}` : ''}
        </div>
      </div>
      <button type="button" class="btn pequeno ${fica === c.id ? 'primario' : ''}" data-fica="${c.id}"
        ${escolhidas.has(c.id) ? '' : 'style="visibility:hidden"'}>${fica === c.id ? 'Fica esta' : 'Manter esta'}</button>
    </label>`;

  return modal({
    titulo: 'Juntar camisolas repetidas',
    largo: true,
    confirmar: 'Juntar',
    corpo: `
      ${caixa('Escolhe as camisolas que sao a mesma coisa e diz qual fica. As linhas das encomendas passam todas para essa, e nenhuma se perde. Fica guardada uma copia de seguranca antes.', 'info')}
      <div class="com-icone">${icone('procurar', 16)}<input type="search" data-procura-junta placeholder="Procurar pelo nome"></div>
      <div class="cartao sem-pad" style="max-height:340px;overflow-y:auto;box-shadow:none">
        <div data-lista-junta></div>
      </div>
      <div class="pequeno" data-resumo-junta style="font-weight:700"></div>`,

    aoAbrir: (m) => {
      const lista = m.querySelector('[data-lista-junta]');
      const resumo = m.querySelector('[data-resumo-junta]');
      const procuraJunta = m.querySelector('[data-procura-junta]');

      const pintar = () => {
        const termo = procuraJunta.value.trim().toLowerCase();
        lista.innerHTML = todas
          .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || escolhidas.has(c.id))
          .map(linha).join('');

        const alvo = todas.find((c) => c.id === fica);
        resumo.textContent = escolhidas.size < 2
          ? 'Escolhe pelo menos duas camisolas.'
          : alvo
            ? `${escolhidas.size - 1} desaparecem e as linhas delas passam para "${alvo.nome}".`
            : 'Falta dizer qual das camisolas fica.';
      };

      lista.addEventListener('change', (e) => {
        const el = e.target.closest('[data-escolher]');
        if (!el) return;
        const id = Number(el.dataset.escolher);
        if (el.checked) {
          escolhidas.add(id);
          if (!fica) fica = id;
        } else {
          escolhidas.delete(id);
          if (fica === id) fica = [...escolhidas][0] ?? null;
        }
        pintar();
      });

      lista.addEventListener('click', (e) => {
        const el = e.target.closest('[data-fica]');
        if (!el) return;
        e.preventDefault();
        fica = Number(el.dataset.fica);
        pintar();
      });

      procuraJunta.addEventListener('input', pintar);
      pintar();
    },

    aoConfirmar: async () => {
      if (escolhidas.size < 2) { aviso('Escolhe pelo menos duas camisolas.', 'erro', 'Faltam camisolas'); return false; }
      if (!fica) { aviso('Diz qual das camisolas fica.', 'erro', 'Falta escolher'); return false; }

      const juntar = [...escolhidas].filter((id) => id !== fica);
      const alvo = todas.find((c) => c.id === fica);
      const ok = await confirmar('Juntar as camisolas?',
        `${plural(juntar.length, 'camisola sai', 'camisolas saem')} do catalogo e as linhas delas passam para
         <b>${esc(alvo.nome)}</b>. Nenhuma linha de encomenda se perde.`,
        { confirmar: 'Juntar', perigo: false });
      if (!ok) return false;

      const r = await chamar('camisolas.fundir', fica, juntar);
      aviso(`${plural(r.linhasMovidas, 'linha passou', 'linhas passaram')} para ${r.camisola.nome}.`, 'ok', 'Camisolas juntas');
      return r;
    }
  });
}

function cartao(c, moeda) {
  const url = fotoUrl(c.foto);
  return `
    <article class="cartao-camisola${c.arquivada ? ' arquivada' : ''}" data-abrir="${c.id}" tabindex="0">
      <div class="img${url ? '' : ' vazia'}" style="${url ? `background-image:url('${url}')` : ''}">
        ${url ? '' : icone('camisola', 40)}
        ${c.vezes_encomendada ? `<span class="pilula acento sem-ponto vezes">${c.vezes_encomendada}×</span>` : ''}
      </div>
      <div class="corpo">
        <div class="nm">${esc(c.nome)}</div>
        ${c.equipa || c.epoca ? `<div class="eq">${esc([c.equipa, c.epoca].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="pe">
          ${c.preco_fornecedor !== null
    ? `<span class="dinheiro">${eur(c.preco_fornecedor, moeda)}</span>`
    : '<span class="pilula aviso">Sem preço</span>'}
          <span class="pequeno dim" style="font-weight:600">${c.vezes_encomendada ? `Última ${data(c.ultima_vez)}` : 'Nunca pedida'}</span>
        </div>
      </div>
    </article>`;
}

/** Ficha da camisola: dados, foto e quem ja a pediu. */
export async function editarCamisola(id) {
  const moeda = estado.definicoes.moeda || '€';
  const c = id ? await chamar('camisolas.porId', id) : null;
  const historico = id ? await chamar('camisolas.historico', id) : [];
  let fotoNova = c ? c.foto : null;

  const previa = (nome) => (nome
    ? `<div class="foto grande" data-previa style="background-image:url('${fotoUrl(nome)}')"></div>`
    : `<div class="foto grande vazia" data-previa>${icone('foto', 34)}</div>`);

  return modal({
    titulo: c ? c.nome : 'Nova camisola',
    largo: !!id,
    confirmar: c ? 'Guardar alterações' : 'Guardar camisola',
    corpo: `
      <div style="display:grid;grid-template-columns:168px 1fr;gap:22px;align-items:start">
        <div>
          <div data-caixa-previa>${previa(fotoNova)}</div>
          <button class="btn pequeno" data-foto style="width:100%;margin-top:10px">${icone('foto', 15)}${fotoNova ? 'Trocar foto' : 'Escolher foto'}</button>
          <button class="btn pequeno fantasma" data-sem-foto style="width:100%;margin-top:4px;${fotoNova ? '' : 'display:none'}">Tirar foto</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="campo"><label>Nome</label>
            <input name="nome" value="${esc(c ? c.nome : '')}" placeholder="Portugal 2026 Home Kit">
            <div class="dica">É este o nome que sai no Excel para o fornecedor.</div></div>
          <div class="grelha-campos" style="grid-template-columns:1fr 1fr 1fr">
            <div class="campo"><label>Equipa</label><input name="equipa" value="${esc(c?.equipa || '')}" placeholder="Opcional"></div>
            <div class="campo"><label>Época</label><input name="epoca" value="${esc(c?.epoca || '')}" placeholder="2025/26"></div>
            <div class="campo"><label>Preço fornecedor (${esc(moeda)})</label>
              <input name="preco" style="text-align:right" value="${c ? valorEuro(c.preco_fornecedor) : ''}" placeholder="10,00"></div>
          </div>
          <div class="campo"><label>Notas</label><textarea name="notas" placeholder="Opcional">${esc(c?.notas || '')}</textarea></div>
          ${c ? `<label class="linha-flex pequeno" style="gap:9px;color:var(--tinta-2);font-weight:600;cursor:pointer">
            <input type="checkbox" name="arquivada" ${c.arquivada ? 'checked' : ''}> Arquivada — deixa de aparecer nas sugestões das encomendas
          </label>` : ''}
        </div>
      </div>

      ${c ? `
      <div>
        <h2 class="secao" style="margin-top:6px">Quem já a pediu <span class="dir pequeno dim">${plural(historico.length, 'vez', 'vezes')}</span></h2>
        ${historico.length ? `
        <div class="cartao sem-pad" style="max-height:240px;overflow-y:auto;box-shadow:none">
          <table>
            <thead><tr><th>Cliente</th><th>Encomenda</th><th>Tam.</th><th>Estampagem</th><th class="num">Fornec.</th><th class="num">Cliente</th></tr></thead>
            <tbody>${historico.map((x) => `
              <tr>
                <td style="font-weight:700">${esc(nomeProprio(x.cliente_nome))}</td>
                <td><div class="pequeno" style="font-weight:600">${esc(x.encomenda_titulo)}</div><div class="pequeno dim">${data(x.encomenda_data)}</div></td>
                <td>${tamanho(x.tamanho)}</td>
                <td>${estampa(x.personalizacao_texto)}</td>
                <td class="num"><span class="dinheiro">${eur(x.preco_fornecedor, moeda)}</span></td>
                <td class="num"><span class="dinheiro">${eur(x.preco_cliente, moeda)}</span></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : '<div class="pequeno dim">Ainda ninguém pediu esta camisola.</div>'}
      </div>
      <div class="linha-flex" style="gap:8px">
        <button class="btn pequeno" data-juntar>${icone('copiar', 15)}Juntar com outra camisola</button>
        ${!historico.length ? `<button class="btn perigo pequeno" data-apagar>${icone('lixo', 15)}Apagar do catálogo</button>` : ''}
      </div>
      ` : ''}`,

    aoAbrir: (m, fechar) => {
      const caixaPrevia = m.querySelector('[data-caixa-previa]');
      const botaoFoto = m.querySelector('[data-foto]');
      const botaoSem = m.querySelector('[data-sem-foto]');

      const mostrar = (nome) => {
        caixaPrevia.innerHTML = previa(nome);
        botaoFoto.innerHTML = `${icone('foto', 15)}${nome ? 'Trocar foto' : 'Escolher foto'}`;
        botaoSem.style.display = nome ? '' : 'none';
      };

      botaoFoto.addEventListener('click', async () => {
        const nome = await chamar('camisolas.escolherFoto', null);
        if (!nome) return;
        fotoNova = nome;
        mostrar(nome);
      });

      botaoSem.addEventListener('click', () => { fotoNova = null; mostrar(null); });

      m.querySelector('[data-juntar]')?.addEventListener('click', async () => {
        if (await juntarCamisolas(c.id)) fechar(true);
      });

      m.querySelector('[data-apagar]')?.addEventListener('click', async () => {
        const ok = await confirmar('Apagar do catálogo?',
          `<b>${esc(c.nome)}</b> nunca foi pedida, por isso sai sem mexer em encomenda nenhuma.`,
          { confirmar: 'Apagar camisola' });
        if (!ok) return;
        await chamar('camisolas.apagar', c.id);
        aviso(`${c.nome} saiu do catálogo.`, 'ok', 'Camisola apagada');
        fechar(true);
      });
    },

    aoConfirmar: async (m) => {
      const v = (n) => m.querySelector(`[name="${n}"]`)?.value.trim() ?? '';
      if (!v('nome')) { aviso('Escreve o nome da camisola.', 'erro', 'Falta o nome'); return false; }

      const dados = {
        nome: v('nome'),
        equipa: v('equipa') || null,
        epoca: v('epoca') || null,
        notas: v('notas') || null,
        foto: fotoNova,
        preco_fornecedor: centimos(v('preco'))
      };
      if (c) {
        dados.arquivada = m.querySelector('[name="arquivada"]')?.checked ? 1 : 0;
        const r = await chamar('camisolas.atualizar', c.id, dados);
        aviso(dados.nome, 'ok', 'Camisola guardada');
        return r;
      }
      const r = await chamar('camisolas.criar', dados);
      aviso(`${dados.nome} está no catálogo.`, 'ok', 'Camisola guardada');
      return r;
    }
  });
}


/**
 * Tira a estampagem dos precos de catalogo que a trazem embutida. Nada e
 * aplicado sem se ver linha a linha, e o preco sugerido pode ser corrigido a
 * mao antes de gravar.
 */
async function reverPrecos(candidatos) {
  const moeda = estado.definicoes.moeda || '\u20ac';

  return modal({
    titulo: 'Rever pre\u00e7os com estampagem inclu\u00edda',
    largo: true,
    confirmar: 'Gravar os pre\u00e7os escolhidos',
    corpo: `
      ${caixa('O pre\u00e7o do cat\u00e1logo deve ser o da camisola lisa. A estampagem \u00e9 somada depois, conforme o que for escrito em cada linha. As encomendas antigas n\u00e3o mudam \u2014 o que muda \u00e9 o ponto de partida das pr\u00f3ximas.', 'info')}
      <div class="cartao sem-pad" style="max-height:380px;overflow-y:auto;box-shadow:none">
        <table>
          <thead><tr>
            <th style="width:42px" class="meio"><input type="checkbox" data-todos checked title="Escolher todas"></th>
            <th>Camisola</th><th class="num">Agora</th><th class="num">Estampagem</th><th class="num" style="width:120px">Passa a</th>
          </tr></thead>
          <tbody>
            ${candidatos.map((c) => `
              <tr>
                <td class="meio"><input type="checkbox" data-escolher="${c.id}" checked></td>
                <td style="font-weight:700">${esc(c.nome)}
                  ${c.confianca === 'baixa' ? '<span class="pilula aviso" style="margin-left:6px">confirmar</span>' : ''}
                  <div class="pequeno dim" style="font-weight:600">${plural(c.linhas, 'linha, sempre personalizada', 'linhas, sempre personalizadas')}</div></td>
                <td class="num"><span class="dinheiro dim">${eur(c.preco_fornecedor, moeda)}</span></td>
                <td class="num"><span class="dinheiro">\u2212 ${eur(c.extra, moeda)}</span></td>
                <td class="num"><input class="editavel num" data-preco="${c.id}" value="${valorEuro(c.preco_sugerido)}"></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`,

    aoAbrir: (m) => {
      m.querySelector('[data-todos]').addEventListener('change', (e) => {
        m.querySelectorAll('[data-escolher]').forEach((c) => { c.checked = e.target.checked; });
      });
    },

    aoConfirmar: async (m) => {
      const escolhidas = [...m.querySelectorAll('[data-escolher]')].filter((c) => c.checked);
      if (!escolhidas.length) { aviso('N\u00e3o escolheste nenhuma camisola.', 'erro', 'Nada para gravar'); return false; }

      const lista = escolhidas.map((c) => {
        const id = Number(c.dataset.escolher);
        return { id, preco_fornecedor: centimos(m.querySelector(`[data-preco="${id}"]`).value) };
      }).filter((x) => x.preco_fornecedor !== null);

      const n = await chamar('camisolas.corrigirPrecos', lista);
      aviso(`${plural(n, 'pre\u00e7o corrigido', 'pre\u00e7os corrigidos')} no cat\u00e1logo.`, 'ok', 'Pre\u00e7os revistos');
      return n;
    }
  });
}
