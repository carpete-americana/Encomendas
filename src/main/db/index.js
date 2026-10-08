'use strict';

const path = require('path');
const fs = require('fs');
const { Database } = require('node-sqlite3-wasm');
const { correrMigracoes } = require('./migracoes');

let db = null;
let caminhoBase = null;
let pastaFotos = null;

/**
 * Abre (ou cria) a base na pasta indicada e deixa-a pronta a usar.
 * `pastaDados` e a userData do Electron; nos testes e uma pasta temporaria.
 */
function abrir(pastaDados) {
  if (db) return db;

  fs.mkdirSync(pastaDados, { recursive: true });
  pastaFotos = path.join(pastaDados, 'fotos');
  fs.mkdirSync(pastaFotos, { recursive: true });

  caminhoBase = path.join(pastaDados, 'encomendas.db');
  db = new Database(caminhoBase);

  // Sem isto o ON DELETE CASCADE das linhas nao e aplicado: o SQLite traz as
  // chaves estrangeiras desligadas por omissao, e por ligacao.
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = TRUNCATE');

  correrMigracoes(db);
  return db;
}

function base() {
  if (!db) throw new Error('A base ainda nao foi aberta. Chamar abrir() primeiro.');
  return db;
}

function fechar() {
  if (db) {
    db.close();
    db = null;
  }
}

function caminhos() {
  return { base: caminhoBase, fotos: pastaFotos };
}

/**
 * Corre `fn` dentro de uma transacao. Aninhar chamadas e seguro: so a mais
 * exterior abre e fecha, as de dentro apenas participam.
 */
let profundidade = 0;
function transacao(fn) {
  const d = base();
  const exterior = profundidade === 0;
  if (exterior) d.run('BEGIN');
  profundidade += 1;
  try {
    const r = fn();
    profundidade -= 1;
    if (exterior) d.run('COMMIT');
    return r;
  } catch (erro) {
    profundidade -= 1;
    if (exterior) {
      try { d.run('ROLLBACK'); } catch { /* a transacao ja pode ter caido */ }
    }
    throw erro;
  }
}

module.exports = { abrir, base, fechar, caminhos, transacao };
