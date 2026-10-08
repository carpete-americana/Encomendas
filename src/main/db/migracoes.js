'use strict';

/**
 * Migracoes por numero de versao. Acrescenta-se ao fim, nunca se edita uma que
 * ja correu numa base real.
 */
const MIGRACOES = [
  {
    versao: 1,
    nome: 'esquema inicial',
    sql: `
      CREATE TABLE definicoes (
        chave     TEXT PRIMARY KEY,
        valor     TEXT NOT NULL,
        tipo      TEXT NOT NULL DEFAULT 'texto',
        descricao TEXT
      );

      CREATE TABLE camisolas (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        nome             TEXT NOT NULL,
        chave            TEXT NOT NULL UNIQUE,
        equipa           TEXT,
        epoca            TEXT,
        foto             TEXT,
        preco_fornecedor INTEGER,
        notas            TEXT,
        arquivada        INTEGER NOT NULL DEFAULT 0,
        criada_em        TEXT NOT NULL
      );
      CREATE INDEX ix_camisolas_nome ON camisolas(nome);

      CREATE TABLE clientes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        nome            TEXT NOT NULL,
        chave           TEXT NOT NULL UNIQUE,
        contacto        TEXT,
        margem_override INTEGER,
        notas           TEXT,
        criado_em       TEXT NOT NULL
      );

      CREATE TABLE encomendas (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo     TEXT NOT NULL,
        data       TEXT NOT NULL,
        fornecedor TEXT,
        estado     TEXT NOT NULL DEFAULT 'rascunho',
        notas      TEXT,
        criada_em  TEXT NOT NULL
      );
      CREATE INDEX ix_encomendas_data ON encomendas(data DESC);

      CREATE TABLE linhas (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        encomenda_id         INTEGER NOT NULL REFERENCES encomendas(id) ON DELETE CASCADE,
        cliente_id           INTEGER NOT NULL REFERENCES clientes(id)   ON DELETE RESTRICT,
        camisola_id          INTEGER NOT NULL REFERENCES camisolas(id)  ON DELETE RESTRICT,
        tamanho              TEXT,
        personalizacao       INTEGER NOT NULL DEFAULT 0,
        personalizacao_texto TEXT,
        preco_fornecedor     INTEGER NOT NULL DEFAULT 0,
        preco_cliente        INTEGER NOT NULL DEFAULT 0,
        estado_chegada       TEXT NOT NULL DEFAULT 'pendente',
        pago                 INTEGER NOT NULL DEFAULT 0,
        notas                TEXT,
        posicao              INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX ix_linhas_encomenda ON linhas(encomenda_id);
      CREATE INDEX ix_linhas_cliente   ON linhas(cliente_id);
      CREATE INDEX ix_linhas_camisola  ON linhas(camisola_id);
    `
  },
  {
    versao: 2,
    nome: 'entrega separada da chegada',
    // Entregar e outra coisa que chegar: a camisola pode estar ca ha uma semana
    // e ainda nao ter ido para o dono. Por isso e uma marca propria, como o pago.
    sql: `
      ALTER TABLE linhas ADD COLUMN entregue INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX ix_linhas_entregue ON linhas(entregue);
    `
  },
  {
    versao: 3,
    nome: 'marca de ja devolvida',
    // "Para devolver" e a decisao; "devolvida" e o que ja foi feito. Sem as
    // duas nao havia como saber o que ainda esta em casa a espera de voltar.
    sql: `
      ALTER TABLE linhas ADD COLUMN devolvida INTEGER NOT NULL DEFAULT 0;
    `
  }
];

const PADROES = [
  ['margem_padrao', '400', 'dinheiro', 'Lucro por camisola, em centimos'],
  ['moeda', '€', 'texto', 'Simbolo da moeda'],
  ['fornecedor', '', 'texto', 'Nome do fornecedor por omissao'],
  ['pasta_exportacao', '', 'texto', 'Pasta onde os Excel sao guardados (vazio = Ambiente de trabalho)'],
  ['tamanhos', 'S,M,L,XL,XXL,24,26,28,30', 'texto', 'Sugestoes de tamanho'],
  ['titulo_exportacao', 'ENCOMENDA CAMISOLAS - {data}', 'texto', 'Titulo da primeira linha do Excel'],
  ['foto_max_px', '420', 'numero', 'Lado maior das fotos guardadas'],
  ['export_altura_linha', '22', 'numero', 'Altura de cada uma das 4 linhas por camisola no Excel'],
  ['export_foto_altura', '108', 'numero', 'Altura da foto no Excel, em pixeis'],
  ['estampagem_nome_numero', '300', 'dinheiro', 'O que o fornecedor cobra a mais por nome E numero'],
  ['estampagem_so_um', '200', 'dinheiro', 'O que cobra por so nome ou so numero']
];

function correrMigracoes(db) {
  db.run('CREATE TABLE IF NOT EXISTS schema_versao (versao INTEGER PRIMARY KEY, nome TEXT, corrida_em TEXT)');
  const feitas = new Set(db.all('SELECT versao FROM schema_versao').map((l) => l.versao));

  for (const m of MIGRACOES) {
    if (feitas.has(m.versao)) continue;
    db.run('BEGIN');
    try {
      db.exec(m.sql);
      db.run('INSERT INTO schema_versao (versao, nome, corrida_em) VALUES (?, ?, ?)', [
        m.versao,
        m.nome,
        new Date().toISOString()
      ]);
      db.run('COMMIT');
    } catch (erro) {
      db.run('ROLLBACK');
      throw new Error(`Migracao ${m.versao} (${m.nome}) falhou: ${erro.message}`);
    }
  }

  // Cada definicao e criada apenas se faltar, para nao desfazer o que o utilizador mudou.
  for (const [chave, valor, tipo, descricao] of PADROES) {
    db.run(
      'INSERT INTO definicoes (chave, valor, tipo, descricao) VALUES (?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET descricao = excluded.descricao, tipo = excluded.tipo',
      [chave, valor, tipo, descricao]
    );
  }
}

module.exports = { correrMigracoes, MIGRACOES, PADROES };
