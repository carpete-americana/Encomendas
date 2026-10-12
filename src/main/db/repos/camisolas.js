'use strict';

const { base, transacao } = require('../index');
const { chave: chaveDe, limpar } = require('../../servicos/texto');
const { nomeDe, emFalta, decompor } = require('../../servicos/nome-camisola');

const CAMPOS_NOME = ['equipa', 'epoca', 'tipo', 'versao', 'detalhe'];

const SELECT_BASE = `
  SELECT c.*,
         (SELECT COUNT(*) FROM linhas l WHERE l.camisola_id = c.id) AS vezes_encomendada,
         (SELECT MAX(e.data) FROM linhas l JOIN encomendas e ON e.id = l.encomenda_id
           WHERE l.camisola_id = c.id) AS ultima_vez
  FROM camisolas c
`;

function listar({ procura = '', incluirArquivadas = false, ordem = 'nome', equipa = '' } = {}) {
  const condicoes = [];
  const params = [];

  if (!incluirArquivadas) condicoes.push('c.arquivada = 0');
  if (equipa) {
    condicoes.push('c.equipa = ? COLLATE NOCASE');
    params.push(equipa);
  }
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

/** As equipas que ja estao no catalogo, para as listas de escolha. */
function equipas() {
  return base().all(
    `SELECT equipa AS nome, COUNT(*) AS camisolas FROM camisolas
     WHERE equipa IS NOT NULL AND TRIM(equipa) <> ''
     GROUP BY equipa COLLATE NOCASE ORDER BY equipa COLLATE NOCASE`
  );
}

/** As epocas ja usadas, da mais recente para a mais antiga. */
function epocas() {
  return base().all(
    `SELECT DISTINCT epoca FROM camisolas WHERE epoca IS NOT NULL AND TRIM(epoca) <> ''
     ORDER BY epoca DESC`
  ).map((l) => l.epoca);
}

function erroRepetida(nome) {
  return new Error(`Já existe a camisola "${nome}" no catálogo.`);
}

/**
 * Camisola nova feita a partir dos campos (equipa, epoca, equipamento...). O
 * nome sai deles, nao e escrito. Ao contrario do criarOuObter, uma repetida e
 * um erro: quem a esta a criar a mao tem de saber que ja la estava.
 */
function criarPorCampos(dados) {
  const falta = emFalta(dados);
  if (falta) throw new Error(`Falta escolher ${falta}.`);
  const nome = nomeDe(dados);
  const existente = porChave(nome);
  if (existente) throw erroRepetida(existente.nome);
  return criarOuObter({ ...dados, nome });
}

/**
 * Cria a camisola, ou devolve a que ja existe com o mesmo nome normalizado.
 * E este `ou devolve` que faz o catalogo crescer sozinho: cada camisola nova
 * escrita numa encomenda fica guardada para a proxima.
 */
function criarOuObter({
  nome, equipa = null, epoca = null, tipo = null, versao = null, detalhe = null,
  foto = null, preco_fornecedor = null, notas = null
}) {
  const limpo = limpar(nome);
  if (!limpo) throw new Error('A camisola precisa de um nome.');

  // Um nome escrito (do Excel antigo) fica como esta, mas o que se conseguir
  // ler nele vai para os campos: e assim que a equipa aparece nas listas.
  if (!equipa) {
    const lido = decompor(limpo);
    if (lido) {
      equipa = lido.equipa;
      epoca = epoca || lido.epoca;
      tipo = tipo || lido.tipo;
      versao = versao || lido.versao;
      detalhe = detalhe || lido.detalhe;
    }
  }

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
      for (const [campo, valor] of Object.entries({ equipa, epoca, tipo, versao, detalhe })) {
        if (!existente[campo] && valor) { campos.push(`${campo} = ?`); params.push(valor); }
      }
      if (campos.length) {
        params.push(existente.id);
        base().run(`UPDATE camisolas SET ${campos.join(', ')} WHERE id = ?`, params);
      }
      return porId(existente.id);
    }

    const r = base().run(
      `INSERT INTO camisolas (nome, chave, equipa, epoca, tipo, versao, detalhe, foto, preco_fornecedor, notas, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [limpo, chaveDe(limpo), limpar(equipa) || null, limpar(epoca) || null, tipo || null, versao || null,
        limpar(detalhe) || null, foto, preco_fornecedor, notas, new Date().toISOString()]
    );
    return porId(r.lastInsertRowid);
  });
}

/**
 * Mexer na equipa, epoca, equipamento, versao ou detalhe refaz o nome. So se
 * escreve o nome diretamente quando nenhum desses vem nos dados.
 */
function atualizar(id, dados) {
  dados = { ...dados };
  if (CAMPOS_NOME.some((c) => c in dados)) {
    const atual = porId(id);
    if (!atual) throw new Error('Camisola nao encontrada.');
    const juntos = { ...atual, ...dados };
    const falta = emFalta(juntos);
    if (falta) throw new Error(`Falta escolher ${falta}.`);
    dados.nome = nomeDe(juntos);
    const outra = porChave(dados.nome);
    if (outra && outra.id !== Number(id)) {
      throw new Error(`Já existe a camisola "${outra.nome}" no catálogo. Usa "Juntar com outra camisola" se forem a mesma.`);
    }
  }

  const permitidos = ['nome', ...CAMPOS_NOME, 'foto', 'preco_fornecedor', 'notas', 'arquivada'];
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
      for (const campo of ['epoca', 'tipo', 'versao', 'detalhe']) {
        if (!atual[campo] && outra[campo]) { campos.push(`${campo} = ?`); params.push(outra[campo]); }
      }
      if (campos.length) {
        params.push(fica.id);
        base().run(`UPDATE camisolas SET ${campos.join(', ')} WHERE id = ?`, params);
      }

      base().run('DELETE FROM camisolas WHERE id = ?', [id]);
    }

    return { camisola: porId(fica.id), linhasMovidas, juntadas: nomes };
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
  listar, porId, porChave, criarOuObter, criarPorCampos, equipas, epocas, atualizar, historico, apagar, fundir
};
