'use strict';

const { base, transacao } = require('../index');
const { calcularTotais, contarPorTamanho } = require('../../servicos/totais');
const { agruparPorCliente } = require('../../servicos/agrupar');
const definicoes = require('./definicoes');
const clientes = require('./clientes');
const camisolas = require('./camisolas');
const { margemAplicavel, precoClienteSugerido, custoEstampagem } = require('../../servicos/precos');

/** O que o fornecedor cobra a mais pela estampagem desta linha. */
function estampagemDe(personalizacao, texto) {
  return custoEstampagem(texto, {
    personalizacao: !!personalizacao,
    nomeNumero: definicoes.ler('estampagem_nome_numero', 0),
    soUm: definicoes.ler('estampagem_so_um', 0)
  });
}

const ESTADOS = ['rascunho', 'enviada', 'em_producao', 'recebida', 'entregue', 'fechada'];
const ESTADOS_CHEGADA = ['pendente', 'chegou', 'em_falta', 'errada'];

function listar() {
  const linhas = base().all(
    `SELECT e.*,
            (SELECT COUNT(DISTINCT l.cliente_id) FROM linhas l WHERE l.encomenda_id = e.id) AS clientes_distintos
     FROM encomendas e ORDER BY e.data DESC, e.id DESC`
  );
  return linhas.map((e) => ({ ...e, totais: calcularTotais(linhasDe(e.id)) }));
}

function porId(id) {
  const e = base().get('SELECT * FROM encomendas WHERE id = ?', [id]);
  if (!e) return null;
  const linhas = linhasDe(id);
  return {
    ...e,
    linhas,
    grupos: agruparPorCliente(linhas),
    totais: calcularTotais(linhas),
    tamanhos: contarPorTamanho(linhas)
  };
}

function linhasDe(encomendaId) {
  return base().all(
    `SELECT l.*,
            cl.nome  AS cliente_nome, cl.contacto AS cliente_contacto, cl.margem_override AS cliente_margem,
            cam.nome AS camisola_nome, cam.foto AS camisola_foto, cam.equipa AS camisola_equipa
     FROM linhas l
     JOIN clientes cl  ON cl.id = l.cliente_id
     JOIN camisolas cam ON cam.id = l.camisola_id
     WHERE l.encomenda_id = ?
     ORDER BY l.posicao ASC, l.id ASC`,
    [encomendaId]
  ).map((l) => ({
    ...l, personalizacao: !!l.personalizacao, pago: !!l.pago, entregue: !!l.entregue, devolvida: !!l.devolvida
  }));
}

function criar({ titulo = null, data = null, fornecedor = null, notas = null } = {}) {
  const dia = data || new Date().toISOString().slice(0, 10);
  const [a, m, d] = dia.split('-');
  const nome = titulo || `Encomenda ${d}/${m}/${a}`;
  const r = base().run(
    'INSERT INTO encomendas (titulo, data, fornecedor, estado, notas, criada_em) VALUES (?, ?, ?, ?, ?, ?)',
    [nome, dia, fornecedor ?? definicoes.ler('fornecedor', ''), 'rascunho', notas, new Date().toISOString()]
  );
  return porId(r.lastInsertRowid);
}

function atualizar(id, dados) {
  const permitidos = ['titulo', 'data', 'fornecedor', 'estado', 'notas'];
  const campos = [];
  const params = [];
  for (const campo of permitidos) {
    if (!(campo in dados)) continue;
    if (campo === 'estado' && !ESTADOS.includes(dados.estado)) {
      throw new Error(`Estado desconhecido: ${dados.estado}`);
    }
    campos.push(`${campo} = ?`);
    params.push(dados[campo]);
  }
  if (!campos.length) return porId(id);
  params.push(id);
  base().run(`UPDATE encomendas SET ${campos.join(', ')} WHERE id = ?`, params);
  return porId(id);
}

function apagar(id) {
  base().run('DELETE FROM encomendas WHERE id = ?', [id]); // as linhas caem por CASCADE
  return true;
}

/**
 * Acrescenta uma linha. Aceita cliente e camisola por id OU por nome, e nesse
 * caso cria-os - e assim que o catalogo cresce enquanto se escreve a encomenda.
 */
function adicionarLinha(encomendaId, dados) {
  return transacao(() => {
    const cliente = dados.cliente_id
      ? clientes.porId(dados.cliente_id)
      : clientes.criarOuObter({ nome: dados.cliente_nome });
    if (!cliente) throw new Error('Cliente nao encontrado.');

    const camisola = dados.camisola_id
      ? camisolas.porId(dados.camisola_id)
      : camisolas.criarOuObter({
        nome: dados.camisola_nome,
        preco_fornecedor: dados.preco_fornecedor ?? null
      });
    if (!camisola) throw new Error('Camisola nao encontrada.');

    // O preco da camisola e o do artigo liso; a estampagem e um extra que o
    // fornecedor cobra por cima. O importador traz precos ja completos do Excel
    // antigo, e nesses nao se soma nada.
    const precoBase = dados.preco_fornecedor ?? camisola.preco_fornecedor ?? null;
    const extra = dados.precos_finais ? 0 : estampagemDe(dados.personalizacao, dados.personalizacao_texto);
    const precoFornecedor = precoBase === null ? null : precoBase + extra;

    const margem = margemAplicavel({
      margemPadrao: definicoes.ler('margem_padrao', 0),
      margemCliente: cliente.margem_override
    });
    const precoCliente = dados.preco_cliente
      ?? precoClienteSugerido({ precoFornecedor, margem })
      ?? 0;

    const proxima = base().get(
      'SELECT COALESCE(MAX(posicao), 0) + 1 AS p FROM linhas WHERE encomenda_id = ?',
      [encomendaId]
    ).p;

    const r = base().run(
      `INSERT INTO linhas (encomenda_id, cliente_id, camisola_id, tamanho, personalizacao,
                           personalizacao_texto, preco_fornecedor, preco_cliente, estado_chegada, pago, notas, posicao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        encomendaId,
        cliente.id,
        camisola.id,
        dados.tamanho || null,
        dados.personalizacao ? 1 : 0,
        dados.personalizacao_texto || null,
        precoFornecedor ?? 0,
        precoCliente,
        dados.estado_chegada || 'pendente',
        dados.pago ? 1 : 0,
        dados.notas || null,
        dados.posicao ?? proxima
      ]
    );
    return r.lastInsertRowid;
  });
}

/**
 * Muda uma linha. Se a estampagem mudar, o preco acompanha: o fornecedor cobra
 * mais por nome e numero do que por so um deles, e ligar a personalizacao numa
 * linha ja escrita tem de somar esse extra dos dois lados.
 */
function atualizarLinha(id, dados) {
  const mexeNaEstampagem = 'personalizacao' in dados || 'personalizacao_texto' in dados;
  const precoEscritoAMao = 'preco_fornecedor' in dados || 'preco_cliente' in dados;

  if (mexeNaEstampagem && !precoEscritoAMao) {
    const antes = base().get('SELECT * FROM linhas WHERE id = ?', [id]);
    if (antes) {
      const personalizacaoNova = 'personalizacao' in dados ? dados.personalizacao : !!antes.personalizacao;
      const textoNovo = 'personalizacao_texto' in dados ? dados.personalizacao_texto : antes.personalizacao_texto;

      const diferenca = estampagemDe(personalizacaoNova, textoNovo)
        - estampagemDe(antes.personalizacao, antes.personalizacao_texto);

      if (diferenca !== 0) {
        dados = {
          ...dados,
          preco_fornecedor: Math.max(0, (antes.preco_fornecedor || 0) + diferenca),
          preco_cliente: Math.max(0, (antes.preco_cliente || 0) + diferenca)
        };
      }
    }
  }

  const permitidos = [
    'cliente_id', 'camisola_id', 'tamanho', 'personalizacao', 'personalizacao_texto',
    'preco_fornecedor', 'preco_cliente', 'estado_chegada', 'pago', 'entregue', 'devolvida', 'notas', 'posicao'
  ];
  const campos = [];
  const params = [];

  for (const campo of permitidos) {
    if (!(campo in dados)) continue;
    if (campo === 'estado_chegada' && !ESTADOS_CHEGADA.includes(dados.estado_chegada)) {
      throw new Error(`Estado de chegada desconhecido: ${dados.estado_chegada}`);
    }
    campos.push(`${campo} = ?`);
    const v = dados[campo];
    params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if (!campos.length) return true;

  params.push(id);
  base().run(`UPDATE linhas SET ${campos.join(', ')} WHERE id = ?`, params);
  return true;
}

function apagarLinha(id) {
  base().run('DELETE FROM linhas WHERE id = ?', [id]);
  return true;
}

/** Duplica uma linha logo a seguir a original: metade dos pedidos e a mesma camisola noutro tamanho. */
function duplicarLinha(id) {
  return transacao(() => {
    const l = base().get('SELECT * FROM linhas WHERE id = ?', [id]);
    if (!l) throw new Error('Linha nao encontrada.');
    base().run('UPDATE linhas SET posicao = posicao + 1 WHERE encomenda_id = ? AND posicao > ?', [
      l.encomenda_id, l.posicao
    ]);
    const r = base().run(
      `INSERT INTO linhas (encomenda_id, cliente_id, camisola_id, tamanho, personalizacao,
                           personalizacao_texto, preco_fornecedor, preco_cliente, estado_chegada, pago, notas, posicao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', 0, ?, ?)`,
      [l.encomenda_id, l.cliente_id, l.camisola_id, l.tamanho, l.personalizacao,
        l.personalizacao_texto, l.preco_fornecedor, l.preco_cliente, l.notas, l.posicao + 1]
    );
    return r.lastInsertRowid;
  });
}

/**
 * Aplica um estado a todas as linhas de um cliente dentro de uma encomenda.
 * `apenas` limita as linhas tocadas: "tudo chegou" so mexe no que esta por
 * chegar, para nao desfazer um "em falta" ou um "entregue" ja marcados a mao.
 */
function marcarBloco(encomendaId, clienteId, {
  estado_chegada = null, pago = null, entregue = null, devolvida = null, apenas = null
} = {}) {
  const campos = [];
  const params = [];
  if (estado_chegada) {
    if (!ESTADOS_CHEGADA.includes(estado_chegada)) throw new Error(`Estado de chegada desconhecido: ${estado_chegada}`);
    campos.push('estado_chegada = ?'); params.push(estado_chegada);
  }
  if (pago !== null) { campos.push('pago = ?'); params.push(pago ? 1 : 0); }
  if (entregue !== null) { campos.push('entregue = ?'); params.push(entregue ? 1 : 0); }
  if (devolvida !== null) { campos.push('devolvida = ?'); params.push(devolvida ? 1 : 0); }
  if (!campos.length) return 0;

  let filtro = '';
  if (apenas && apenas.length) {
    for (const e of apenas) {
      if (!ESTADOS_CHEGADA.includes(e)) throw new Error(`Estado de chegada desconhecido: ${e}`);
    }
    filtro = ` AND estado_chegada IN (${apenas.map(() => '?').join(', ')})`;
  }

  params.push(encomendaId, clienteId, ...(apenas || []));
  return base().run(
    `UPDATE linhas SET ${campos.join(', ')} WHERE encomenda_id = ? AND cliente_id = ?${filtro}`,
    params
  ).changes;
}

/** Reordena as linhas de um cliente pela ordem dos ids recebida. */
function reordenar(encomendaId, ids) {
  return transacao(() => {
    ids.forEach((id, i) => {
      base().run('UPDATE linhas SET posicao = ? WHERE id = ? AND encomenda_id = ?', [i + 1, id, encomendaId]);
    });
    return true;
  });
}

module.exports = {
  ESTADOS, ESTADOS_CHEGADA,
  listar, porId, linhasDe, criar, atualizar, apagar,
  adicionarLinha, atualizarLinha, apagarLinha, duplicarLinha, marcarBloco, reordenar
};
