import {
  chamar, esc, eur, data, ligar, vazio, modal, confirmar, aviso, fotoUrl, centimos, valorEuro,
  icone, plural, tamanho, estampa, nomeProprio, fotoMini, caixa
} from '../util.js';
import { estado } from '../app.js';
import { autocompletar } from '../componentes/autocompletar.js';

const filtros = { procura: '', ordem: 'populares', incluirArquivadas: false, equipa: '' };
const ORDENS = [['populares', 'Mais pedidas'], ['nome', 'A–Z'], ['recentes', 'Recentes'], ['preco', 'Preço']];

export async function desenhar(raiz) {
  const lista = await chamar('camisolas.listar', filtros);
  const equipas = await chamar('camisolas.equipas');
  const moeda = estado.definicoes.moeda || '€';
  const nunca = lista.filter((c) => !c.vezes_encomendada).length;
  const semFoto = lista.filter((c) => !c.foto).length;
  const semPreco = lista.filter((c) => c.preco_fornecedor === null).length;

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Catálogo</h1>
        <div class="sub"><span>${plural(lista.length, 'camisola guardada', 'camisolas guardadas')}</span>
          <span class="ponto">Cada camisola define-se pela equipa, época e equipamento</span></div>
      </div>
      <div class="acoes">
        <button class="btn" data-juntar-tudo title="Junta camisolas repetidas com nomes diferentes">${icone('copiar', 16)}Juntar repetidas</button>
        <button class="btn" data-limpar-fotos title="Apaga ficheiros de foto que nenhuma camisola usa">${icone('arquivo', 16)}Limpar fotos soltas</button>
        <button class="btn primario" data-nova>${icone('mais', 16)}Nova camisola</button>
      </div>
    </div>

    <div class="barra-ferramentas">
      <div class="com-icone">${icone('procurar', 16)}<input type="search" data-procura placeholder="Procurar por nome ou equipa" value="${esc(filtros.procura)}"></div>
      ${equipas.length ? `<select data-equipa style="width:auto;min-width:170px" title="Mostrar só uma equipa">
        <option value="">Todas as equipas</option>
        ${equipas.map((q) => `<option value="${esc(q.nome)}" ${filtros.equipa.toLowerCase() === q.nome.toLowerCase() ? 'selected' : ''}>${esc(q.nome)} (${q.camisolas})</option>`).join('')}
      </select>` : ''}
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
    : `<div class="cartao">${vazio('camisola', filtros.procura || filtros.equipa ? 'Nada encontrado' : 'Catálogo vazio',
      filtros.procura || filtros.equipa ? 'Nenhuma camisola bate com essa procura. Experimenta só a equipa ou o ano.'
        : 'Importa o Excel antigo ou cria a primeira camisola: escolhes a equipa, o ano e o equipamento.',
      filtros.procura || filtros.equipa ? '' : `<button class="btn primario" data-nova>${icone('mais', 16)}Nova camisola</button>`)}</div>`}`;

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
  raiz.querySelector('[data-equipa]')?.addEventListener('change', (e) => {
    filtros.equipa = e.target.value;
    desenhar(raiz);
  });
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

function lerCampos(m) {
  const v = (n) => m.querySelector(`[name="${n}"]`)?.value.trim() || null;
  return { equipa: v('equipa'), epoca: v('epoca'), tipo: v('tipo'), versao: v('versao'), detalhe: v('detalhe') };
}

/** Anos para escolher: os ja usados e os das ultimas epocas, nos dois formatos. */
function anosPara(usadas) {
  const ano = new Date().getFullYear();
  const gerados = [];
  for (let a = ano + 1; a >= ano - 4; a -= 1) gerados.push(String(a), `${a - 1}/${String(a).slice(-2)}`);
  return [...new Set([...usadas, ...gerados])].sort((x, y) => y.localeCompare(x));
}

/**
 * Ficha da camisola: dados, foto e quem ja a pediu. A camisola define-se por
 * equipa, epoca e equipamento; o nome sai deles. `texto` (de uma encomenda)
 * serve para adivinhar os campos de uma camisola nova, e `preco` ja vem escrito.
 */
export async function editarCamisola(id, { texto = '', preco = '' } = {}) {
  const moeda = estado.definicoes.moeda || '€';
  const c = id ? await chamar('camisolas.porId', id) : null;
  const historico = id ? await chamar('camisolas.historico', id) : [];
  const [{ tipos, versoes }, equipas, epocas] = await Promise.all([
    chamar('camisolas.opcoes'), chamar('camisolas.equipas'), chamar('camisolas.epocas')
  ]);
  const anos = anosPara(epocas);
  const lido = !c && texto ? (await chamar('camisolas.decompor', texto)) || { equipa: texto } : null;
  const v0 = c || lido || {};
  // Camisola antiga cujo nome nao se conseguiu ler: guarda-se sem lhe mudar o
  // nome enquanto os campos nao estiverem todos escolhidos.
  const antiga = !!c && !c.tipo;
  let fotoNova = c ? c.foto : null;

  const previa = (nome) => (nome
    ? `<div class="foto grande" data-previa style="background-image:url('${fotoUrl(nome)}')"></div>`
    : `<div class="foto grande vazia" data-previa>${icone('foto', 34)}</div>`);

  return modal({
    titulo: c ? c.nome : 'Nova camisola',
    largo: true,
    confirmar: c ? 'Guardar alterações' : 'Guardar camisola',
    corpo: `
      <div style="display:grid;grid-template-columns:168px 1fr;gap:22px;align-items:start">
        <div>
          <div data-caixa-previa>${previa(fotoNova)}</div>
          <button class="btn pequeno" data-foto style="width:100%;margin-top:10px">${icone('foto', 15)}${fotoNova ? 'Trocar foto' : 'Escolher foto'}</button>
          <button class="btn pequeno" data-colar-foto style="width:100%;margin-top:4px" title="Usa a imagem copiada (Ctrl+C). Também dá com Ctrl+V aqui na ficha.">${icone('copiar', 15)}Colar foto</button>
          <button class="btn pequeno fantasma" data-sem-foto style="width:100%;margin-top:4px;${fotoNova ? '' : 'display:none'}">Tirar foto</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="grelha-campos" style="grid-template-columns:1.4fr 1fr">
            <div class="campo"><label>Equipa</label>
              <input name="equipa" value="${esc(v0.equipa || '')}" placeholder="Escolher ou escrever" autocomplete="off"></div>
            <div class="campo"><label>Época / ano</label>
              <input name="epoca" value="${esc(v0.epoca || '')}" placeholder="2025/26" autocomplete="off"></div>
          </div>
          <div class="grelha-campos" style="grid-template-columns:1fr 1fr">
            <div class="campo"><label>Equipamento</label>
              <select name="tipo">
                <option value="">Escolher…</option>
                ${tipos.map((t) => `<option value="${t.valor}" ${v0.tipo === t.valor ? 'selected' : ''}>${esc(t.rotulo)}</option>`).join('')}
              </select></div>
            <div class="campo"><label>Versão</label>
              <select name="versao">
                <option value="">Não indicar</option>
                ${versoes.map((x) => `<option value="${x.valor}" ${v0.versao === x.valor ? 'selected' : ''}>${esc(x.rotulo)}</option>`).join('')}
              </select></div>
          </div>
          <div class="grelha-campos" style="grid-template-columns:1.4fr 1fr">
            <div class="campo"><label>Detalhe</label>
              <input name="detalhe" value="${esc(v0.detalhe || '')}" placeholder="Opcional — ex.: Manga comprida"></div>
            <div class="campo"><label>Preço fornecedor (${esc(moeda)})</label>
              <input name="preco" style="text-align:right" value="${c ? valorEuro(c.preco_fornecedor) : esc(preco)}" placeholder="10,00"></div>
          </div>
          <div class="pequeno" data-nome-gerado style="font-weight:600"></div>
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
      const campo = (n) => m.querySelector(`[name="${n}"]`);
      const nomeGerado = m.querySelector('[data-nome-gerado]');

      // O nome que vai sair, a medida que se escolhe.
      const mostrarNome = async () => {
        const campos = lerCampos(m);
        if (!campos.equipa || !campos.epoca || !campos.tipo) {
          nomeGerado.innerHTML = antiga
            ? `<span class="dim">Nome atual: <b>${esc(c.nome)}</b>. Escolhe equipa, época e equipamento e o nome passa a ser feito por eles.</span>`
            : '<span class="dim">Escolhe a equipa, a época e o equipamento — o nome faz-se sozinho.</span>';
          return;
        }
        const nome = await chamar('camisolas.nomeDe', campos);
        nomeGerado.innerHTML = c && nome !== c.nome
          ? `Nome no Excel do fornecedor passa a: <b>${esc(nome)}</b> <span class="dim">(era ${esc(c.nome)})</span>`
          : `Nome no Excel do fornecedor: <b>${esc(nome)}</b>`;
      };
      ['equipa', 'epoca', 'tipo', 'versao', 'detalhe'].forEach((n) => {
        campo(n).addEventListener('input', mostrarNome);
        campo(n).addEventListener('change', mostrarNome);
      });
      mostrarNome();

      const lista = (input, valores, desenhar, textoNovo) => autocompletar(input, {
        procurar: async (t) => {
          const termo = t.toLowerCase();
          return valores.filter((x) => !termo || x.nome.toLowerCase().includes(termo));
        },
        desenhar,
        permitirNovo: true,
        textoNovo,
        aoEscolher: (item) => {
          input.value = item.novo ?? item.nome;
          mostrarNome();
        }
      });
      lista(campo('equipa'), equipas,
        (q) => `<div style="flex:1;font-weight:700">${esc(q.nome)}</div><span class="pequeno dim" style="font-weight:600">${plural(q.camisolas, 'camisola', 'camisolas')}</span>`,
        'Nova equipa');
      lista(campo('epoca'), anos.map((nome) => ({ nome })),
        (x) => `<div style="flex:1;font-weight:700">${esc(x.nome)}</div>${epocas.includes(x.nome) ? '<span class="pequeno dim" style="font-weight:600">já usada</span>' : ''}`,
        'Usar');

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

      const colar = async () => {
        const nome = await chamar('camisolas.colarFoto', null);
        fotoNova = nome;
        mostrar(nome);
        aviso('Fica quando guardares a camisola.', 'ok', 'Foto colada');
      };
      m.querySelector('[data-colar-foto]').addEventListener('click', () => colar().catch(() => {}));
      // Ctrl+V com uma imagem copiada vira a foto. Texto copiado continua a
      // colar-se normalmente nos campos.
      m.addEventListener('paste', (e) => {
        const temImagem = [...(e.clipboardData?.items || [])].some((i) => i.type.startsWith('image/'));
        if (!temImagem) return;
        e.preventDefault();
        colar().catch(() => {});
      });

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
      const campos = lerCampos(m);
      const falta = !campos.equipa ? 'a equipa' : !campos.epoca ? 'a época' : !campos.tipo ? 'o equipamento' : null;
      // Uma antiga ainda por arrumar pode guardar-se (a foto, o preco...) sem
      // os campos; as outras nao.
      if (falta && !(antiga && !campos.tipo)) {
        aviso(`Falta escolher ${falta}.`, 'erro', 'Camisola incompleta');
        return false;
      }

      const dados = {
        ...(falta ? {} : campos),
        notas: v('notas') || null,
        foto: fotoNova,
        preco_fornecedor: centimos(v('preco'))
      };
      if (c) {
        dados.arquivada = m.querySelector('[name="arquivada"]')?.checked ? 1 : 0;
        const r = await chamar('camisolas.atualizar', c.id, dados);
        aviso(r.nome, 'ok', 'Camisola guardada');
        return r;
      }
      const r = await chamar('camisolas.criar', dados);
      aviso(`${r.nome} está no catálogo.`, 'ok', 'Camisola guardada');
      return r;
    }
  });
}
