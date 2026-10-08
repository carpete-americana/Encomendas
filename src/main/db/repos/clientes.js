'use strict';

const { base, transacao } = require('../index');
const { chave: chaveDe, limpar } = require('../../servicos/texto');

// Uma camisola "em falta" vai de volta ao fornecedor: nao e vendida, por isso
// nao entra no que o cliente gastou, no que deve, nem no que tem para receber.
const VENDIDA = "l.estado_chegada <> 'em_falta'";

const SELECT_BASE = `
  SELECT c.*,
         (SELECT COUNT(*) FROM linhas l WHERE l.cliente_id = c.id) AS total_camisolas,
         (SELECT COUNT(DISTINCT l.encomenda_id) FROM linhas l WHERE l.cliente_id = c.id) AS total_encomendas,
         (SELECT COALESCE(SUM(l.preco_cliente), 0) FROM linhas l WHERE l.cliente_id = c.id AND ${VENDIDA}) AS total_gasto,
         (SELECT COALESCE(SUM(l.preco_cliente), 0) FROM linhas l
           WHERE l.cliente_id = c.id AND l.pago = 0 AND ${VENDIDA}) AS por_receber,
         (SELECT COUNT(*) FROM linhas l WHERE l.cliente_id = c.id AND l.entregue = 0 AND ${VENDIDA}) AS por_entregar,
         (SELECT COUNT(*) FROM linhas l
           WHERE l.cliente_id = c.id AND l.estado_chegada = 'em_falta' AND l.devolvida = 0) AS por_devolver,
         (SELECT COUNT(*) FROM linhas l WHERE l.cliente_id = c.id AND l.entregue = 0 AND l.estado_chegada = 'chegou')
           AS prontas_para_entregar,
         (SELECT MAX(e.data) FROM linhas l JOIN encomendas e ON e.id = l.encomenda_id
           WHERE l.cliente_id = c.id) AS ultima_encomenda
  FROM clientes c
`;

function listar({ procura = '' } = {}) {
  const where = procura.trim() ? 'WHERE c.chave LIKE ?' : '';
  const params = procura.trim() ? [`%${chaveDe(procura)}%`] : [];
  return base().all(`${SELECT_BASE} ${where} ORDER BY c.nome COLLATE NOCASE ASC`, params);
}

function porId(id) {
  return base().get(`${SELECT_BASE} WHERE c.id = ?`, [id]) || null;
}

function porChave(nome) {
  return base().get(`${SELECT_BASE} WHERE c.chave = ?`, [chaveDe(nome)]) || null;
}

function criarOuObter({ nome, contacto = null, margem_override = null, notas = null }) {
  const limpo = limpar(nome);
  if (!limpo) throw new Error('O cliente precisa de um nome.');

  return transacao(() => {
    const existente = porChave(limpo);
    if (existente) return existente;
    const r = base().run(
      'INSERT INTO clientes (nome, chave, contacto, margem_override, notas, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      [limpo, chaveDe(limpo), contacto, margem_override, notas, new Date().toISOString()]
    );
    return porId(r.lastInsertRowid);
  });
}

function atualizar(id, dados) {
  const permitidos = ['nome', 'contacto', 'margem_override', 'notas'];
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
  base().run(`UPDATE clientes SET ${campos.join(', ')} WHERE id = ?`, params);
  return porId(id);
}

/** Tudo o que este cliente ja pediu, encomenda a encomenda. */
function historico(id) {
  return base().all(
    `SELECT l.*, cam.nome AS camisola_nome, cam.foto AS camisola_foto,
            e.id AS encomenda_id, e.titulo AS encomenda_titulo, e.data AS encomenda_data, e.estado AS encomenda_estado
     FROM linhas l
     JOIN camisolas cam ON cam.id = l.camisola_id
     JOIN encomendas e  ON e.id = l.encomenda_id
     WHERE l.cliente_id = ?
     ORDER BY e.data DESC, l.posicao ASC`,
    [id]
  ).map((l) => ({
    ...l, personalizacao: !!l.personalizacao, pago: !!l.pago, entregue: !!l.entregue, devolvida: !!l.devolvida
  }));
}

function apagar(id) {
  const usos = base().get('SELECT COUNT(*) AS n FROM linhas WHERE cliente_id = ?', [id]).n;
  if (usos > 0) throw new Error(`Este cliente tem ${usos} camisola(s) em encomendas. Nao pode ser apagado.`);
  base().run('DELETE FROM clientes WHERE id = ?', [id]);
  return true;
}

module.exports = { listar, porId, porChave, criarOuObter, atualizar, historico, apagar };
