'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

/**
 * Copias de seguranca da base. Sao feitas com `VACUUM INTO`, que escreve uma
 * base inteira e consistente mesmo com a app a trabalhar - um `copyFile` podia
 * apanhar o ficheiro a meio de uma escrita.
 *
 * Nada aqui apaga dados do utilizador: a poda so mexe nos ficheiros de copia,
 * e restaurar guarda primeiro o estado atual.
 */

const MAX_COPIAS = 40;
const HORAS_ENTRE_AUTOMATICAS = 6;

function pasta() {
  const p = path.join(path.dirname(db.caminhos().base), 'copias');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function carimbo(d = new Date()) {
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
}

/** Cria uma copia. `motivo` fica no nome do ficheiro para se perceber de onde veio. */
function criar(motivo = 'manual') {
  const seguro = String(motivo).replace(/[^\w-]/g, '-').slice(0, 30);

  // O carimbo tem segundos, e duas copias no mesmo segundo ficavam com o mesmo
  // nome: a segunda escrevia por cima da primeira. Uma copia nunca substitui
  // outra - se o nome ja existir, acrescenta-se um numero.
  const base = path.join(pasta(), `encomendas_${carimbo()}_${seguro}`);
  let destino = `${base}.db`;
  for (let n = 2; fs.existsSync(destino); n += 1) destino = `${base}-${n}.db`;

  // A ligacao aberta escreve a copia ela propria; sem ligacao, copia-se o ficheiro.
  try {
    db.base().run(`VACUUM INTO ${JSON.stringify(destino)}`);
  } catch (erro) {
    const origem = db.caminhos().base;
    if (!fs.existsSync(origem)) throw erro;
    fs.copyFileSync(origem, destino);
  }

  podar();
  return listar().find((c) => c.caminho === destino) || null;
}

/** Uma copia de 6 em 6 horas, no arranque. Nunca falha o arranque da app. */
function automatica() {
  try {
    const ultima = listar()[0];
    if (ultima && Date.now() - ultima.quando < HORAS_ENTRE_AUTOMATICAS * 3600 * 1000) return null;
    return criar('arranque');
  } catch (erro) {
    console.error('[copias] a copia de arranque falhou:', erro.message);
    return null;
  }
}

function listar() {
  const p = pasta();
  return fs.readdirSync(p)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(p, f));
      return {
        nome: f,
        caminho: path.join(p, f),
        bytes: stat.size,
        quando: stat.mtimeMs,
        // O "-2" de um nome repetido no mesmo segundo nao faz parte do motivo.
        motivo: (f.match(/_([a-z][\w-]*?)(?:-\d+)?\.db$/i) || [, '?'])[1]
      };
    })
    .sort((a, b) => b.quando - a.quando);
}

/** Apaga as copias mais antigas acima do limite. So mexe em ficheiros de copia. */
function podar() {
  const todas = listar();
  for (const c of todas.slice(MAX_COPIAS)) {
    try { fs.unlinkSync(c.caminho); } catch { /* ja nao existe */ }
  }
  return todas.length - Math.min(todas.length, MAX_COPIAS);
}

/**
 * Volta atras para uma copia. O estado de agora e guardado como copia antes de
 * ser substituido, por isso restaurar por engano tem sempre desfazer.
 */
function restaurar(caminho) {
  const escolhida = listar().find((c) => c.caminho === path.resolve(caminho));
  if (!escolhida) throw new Error('Essa cópia já não existe.');

  const antes = criar('antes-de-restaurar');
  const destino = db.caminhos().base;

  db.fechar();
  fs.copyFileSync(escolhida.caminho, destino);
  db.abrir(path.dirname(destino));

  return { restaurada: escolhida, guardadaAntes: antes };
}

/** Copia a base e as fotos para uma pasta a escolha (pen, drive, outro disco). */
function exportarPara(pastaDestino) {
  const destino = path.join(pastaDestino, `Encomendas_${carimbo()}`);
  fs.mkdirSync(destino, { recursive: true });

  db.base().run(`VACUUM INTO ${JSON.stringify(path.join(destino, 'encomendas.db'))}`);

  const fotos = db.caminhos().fotos;
  const destinoFotos = path.join(destino, 'fotos');
  fs.mkdirSync(destinoFotos, { recursive: true });
  let nFotos = 0;
  for (const f of fs.readdirSync(fotos)) {
    fs.copyFileSync(path.join(fotos, f), path.join(destinoFotos, f));
    nFotos += 1;
  }

  return { pasta: destino, fotos: nFotos, bytes: fs.statSync(path.join(destino, 'encomendas.db')).size };
}

module.exports = { criar, automatica, listar, podar, restaurar, exportarPara, pasta, MAX_COPIAS };
