'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { caminhos } = require('../db');

/**
 * As fotos ficam em <userData>/fotos, com o nome a ser o resumo do conteudo.
 * A mesma foto usada por varias camisolas ocupa um ficheiro so, e o Excel de
 * origem tinha 16 MB precisamente por guardar tudo em tamanho original.
 */
async function guardar(buffer, { maxPx = 420 } = {}) {
  if (!buffer || !buffer.length) return null;

  const reduzida = await sharp(buffer)
    .rotate() // respeita o EXIF; fotos de telemovel vinham deitadas
    .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const nome = `${crypto.createHash('sha256').update(reduzida).digest('hex').slice(0, 16)}.jpg`;
  const destino = path.join(caminhos().fotos, nome);
  if (!fs.existsSync(destino)) fs.writeFileSync(destino, reduzida);
  return nome;
}

async function guardarDeFicheiro(caminhoOrigem, opcoes) {
  return guardar(fs.readFileSync(caminhoOrigem), opcoes);
}

function caminhoDe(nome) {
  if (!nome) return null;
  const p = path.join(caminhos().fotos, nome);
  return fs.existsSync(p) ? p : null;
}

function lerBuffer(nome) {
  const p = caminhoDe(nome);
  return p ? fs.readFileSync(p) : null;
}

/** Data URL para o renderer mostrar a foto sem expor o sistema de ficheiros. */
function dataUrl(nome) {
  const b = lerBuffer(nome);
  return b ? `data:image/jpeg;base64,${b.toString('base64')}` : null;
}

async function dimensoes(nome) {
  const p = caminhoDe(nome);
  if (!p) return null;
  const m = await sharp(p).metadata();
  return { largura: m.width, altura: m.height };
}

/** Apaga as fotos que nenhuma camisola referencia. */
function limparOrfas(nomesEmUso) {
  const usados = new Set(nomesEmUso.filter(Boolean));
  const pasta = caminhos().fotos;
  let apagadas = 0;
  for (const f of fs.readdirSync(pasta)) {
    if (!usados.has(f)) {
      fs.unlinkSync(path.join(pasta, f));
      apagadas += 1;
    }
  }
  return apagadas;
}

module.exports = { guardar, guardarDeFicheiro, caminhoDe, lerBuffer, dataUrl, dimensoes, limparOrfas };
