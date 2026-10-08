'use strict';

const { base, transacao } = require('../index');
const { chave: chaveDe, limpar } = require('../../servicos/texto');

const SELECT_BASE = `
  SELECT c.*,
         (SELECT COUNT(*) FROM linhas l WHERE l.camisola_id = c.id) AS vezes_encomendada,
         (SELECT MAX(e.data) FROM linhas l JOIN encomendas e ON e.id = l.encomenda_id
           WHERE l.camisola_id = c.id) AS ultima_vez
  FROM camisolas c
`;

function listar({ procura = '', incluirArquivadas = false, ordem = 'nome' } = {}) {
  const condicoes = [];
  const params = [];

  if (!incluirArquivadas) condicoes.push('c.arquivada = 0');
  if (procura.trim()) {
    condicoes.push('(c.chave LIKE ? OR LOWER(COALESCE(c.equipa, \'\')) LIKE ?)');
    const p = `%${chaveDe(procura)}%`;
    params.push(p, p);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const ordenacao = {
    nome: 'c.nome COLLATE NOCASE ASC',
    populares: 'vezes_encomendada DESC, c.nome COLLATE NOCASE ASC',
    recentes: 'c.criada_em DESC',
    preco: 'c.preco_fornecedor DESC'
  }[ordem] || 'c.nome COLLATE NOCASE ASC';

  return base().all(`${SELECT_BASE} ${where} ORDER BY ${ordenacao}`, params);
}

function porId(id) {
  return base().get(`${SELECT_BASE} WHERE c.id = ?`, [id]) || null;
}

function porChave(nome) {
  return base().get(`${SELECT_BASE} WHERE c.chave = ?`, [chaveDe(nome)]) || null;
}

/**
 * Cria a camisola, ou devolve a que ja existe com o mesmo nome normalizado.
 * E este `ou devolve` que faz o catalogo crescer sozinho: cada camisola nova
 * escrita numa encomenda fica guardada para a proxima.
 */
function criarOuObter({ nome, equipa = null, epoca = null, foto = null, preco_fornecedor = null, notas = null }) {
  const limpo = limpar(nome);
  if (!limpo) throw new Error('A camisola precisa de um nome.');

  return transacao(() => {
    const existente = porChave(limpo);
    if (existente) {
      // Preenche o que faltava sem apagar o que ja la estava.
      const campos = [];
      const params = [];
      if (!existente.foto && foto) { campos.push('foto = ?'); params.push(foto); }
      if (existente.preco_fornecedor === null && preco_fornecedor !== null) {
        campos.push('preco_fornecedor = ?'); params.push(preco_fornecedor);
      }
      if (!existente.equipa && equipa) { campos.push('equipa = ?'); params.push(equipa); }
      if (campos.length) {
        params.push(existente.id);
        base().run(`UPDATE camisolas SET ${campos.join(', ')} WHERE id = ?`, params);
      }
      return porId(existente.id);
    }

    const r = base().run(
      `INSERT INTO camisolas (nome, chave, equipa, epoca, foto, preco_fornecedor, notas, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [limpo, chaveDe(limpo), equipa, epoca, foto, preco_fornecedor, notas, new Date().toISOString()]
    );
    return porId(r.lastInsertRowid);
  });
}

function atualizar(id, dados) {
  const permitidos = ['nome', 'equipa', 'epoca', 'foto', 'preco_fornecedor', 'notas', 'arquivada'];
  const campos = [];
  const params = [];

  for (const campo of permitidos) {
    if (!(campo in dados)) continue;
    campos.push(`${campo} = ?`);
    params.push(dados[campo]);
    if (campo === 'nome') {
      campos.push('chave = ?');
      params.push(chaveDe(dados.nome));
    }
  }
  if (!campos.length) return porId(id);

  params.push(id);
  base().run(`UPDATE camisolas SET ${campos.join(', ')} WHERE id = ?`, params);
  return porId(id);
}

/** Quem ja encomendou esta camisola, da mais recente para a mais antiga. */
function historico(id) {
  return base().all(
    `SELECT l.id, l.tamanho, l.personalizacao_texto, l.preco_fornecedor, l.preco_cliente,
            e.id AS encomenda_id, e.titulo AS encomenda_titulo, e.data AS encomenda_data,
            cl.nome AS cliente_nome
     FROM linhas l
     JOIN encomendas e ON e.id = l.encomenda_id
     JOIN clientes cl  ON cl.id = l.cliente_id
     WHERE l.camisola_id = ?
     ORDER BY e.data DESC, l.id DESC`,
    [id]
  );
}

/**
 * Junta camisolas que sao a mesma coisa escrita de maneiras diferentes (um
 * engano num Excel antigo). As linhas passam todas para a que fica, e as outras
 * sao apagadas. Nenhuma linha de encomenda se perde: o que muda e a que
 * camisola do catalogo apontam.
 */
function fundir(idFica, idsJuntar) {
  const alvos = [...new Set(idsJuntar.map(Number))].filter((id) => id && id !== Number(idFica));
  if (!alvos.length) throw new Error('Escolhe pelo menos uma camisola diferente para juntar.');

  return transacao(() => {
    const fica = porId(Number(idFica));
    if (!fica) throw new Error('A camisola que fica nao existe.');

    let linhasMovidas = 0;
    const nomes = [];

    for (const id of alvos) {
      const outra = porId(id);
      if (!outra) continue;
      nomes.push(outra.nome);

      linhasMovidas += base().run('UPDATE linhas SET camisola_id = ? WHERE camisola_id = ?', [fica.id, id]).changes;

      // A que fica herda o que lhe faltava; o que ja tinha nao e tocado.
      const campos = [];
      const params = [];
      const atual = porId(fica.id);
      if (!atual.foto && outra.foto) { campos.push('foto = ?'); params.push(outra.foto); }
      if (atual.preco_fornecedor === null && outra.preco_fornecedor !== null) {
        campos.push('preco_fornecedor = ?'); params.push(outra.preco_fornecedor);
      }
      if (!atual.equipa && outra.equipa) { campos.push('equipa = ?'); params.push(outra.equipa); }
      if (!atual.epoca && outra.epoca) { campos.push('epoca = ?'); params.push(outra.epoca); }
      if (campos.length) {
        params.push(fica.id);
        base().run(`UPDATE camisolas SET ${campos.join(', ')} WHERE id = ?`, params);
      }

      base().run('DELETE FROM camisolas WHERE id = ?', [id]);
    }

    return { camisola: porId(fica.id), linhasMovidas, juntadas: nomes };
  });
}

/**
 * Camisolas cujo preco de catalogo traz a estampagem la dentro. Acontece com o
 * que veio dos Excel antigos: se a camisola so foi pedida personalizada, o
 * preco que ficou guardado e o da camisola MAIS a estampagem. Pedi-la de novo
 * personalizada somaria o extra outra vez.
 *
 * So aponta o dedo; corrigir e um passo a parte, confirmado a mao.
 */
function precosComEstampagemIncluida({ nomeNumero = 0, soUm = 0 } = {}) {
  const { custoEstampagem } = require('../../servicos/precos');

  return base().all(
    `SELECT c.id, c.nome, c.preco_fornecedor,
            COUNT(l.id) AS linhas,
            SUM(CASE WHEN l.personalizacao = 1 THEN 1 ELSE 0 END) AS com_estampagem
     FROM camisolas c JOIN linhas l ON l.camisola_id = c.id
     WHERE c.preco_fornecedor IS NOT NULL
     GROUP BY c.id
     HAVING linhas = com_estampagem`
  ).map((c) => {
    // O extra sai do que foi escrito nas linhas dela, nao de um palpite.
    const textos = base().all(
      'SELECT personalizacao_texto FROM linhas WHERE camisola_id = ? AND personalizacao = 1', [c.id]
    ).map((l) => l.personalizacao_texto);

    const extra = Math.min(...textos.map((t) => custoEstampagem(t, { nomeNumero, soUm })));
    const combina = base().get(
      'SELECT COUNT(*) AS n FROM linhas WHERE camisola_id = ? AND preco_fornecedor = ?', [c.id, c.preco_fornecedor]
    ).n > 0;

    return {
      ...c,
      extra,
      preco_sugerido: Math.max(0, c.preco_fornecedor - extra),
      confianca: combina ? 'alta' : 'baixa'
    };
  }).filter((c) => c.extra > 0 && c.preco_sugerido > 0);
}

/** Grava os precos revistos. Recebe [{ id, preco_fornecedor }]. */
function corrigirPrecos(lista) {
  return transacao(() => {
    let n = 0;
    for (const { id, preco_fornecedor: preco } of lista) {
      if (preco === null || preco === undefined) continue;
      n += base().run('UPDATE camisolas SET preco_fornecedor = ? WHERE id = ?', [preco, id]).changes;
    }
    return n;
  });
}

/** Nunca se apaga uma camisola que ja esta numa encomenda: reescreveria a historia. */
function apagar(id) {
  const usos = base().get('SELECT COUNT(*) AS n FROM linhas WHERE camisola_id = ?', [id]).n;
  if (usos > 0) {
    throw new Error(`Esta camisola esta em ${usos} linha(s) de encomenda. Arquiva-a em vez de a apagar.`);
  }
  base().run('DELETE FROM camisolas WHERE id = ?', [id]);
  return true;
}

module.exports = {
  listar, porId, porChave, criarOuObter, atualizar, historico, apagar, fundir,
  precosComEstampagemIncluida, corrigirPrecos
};
