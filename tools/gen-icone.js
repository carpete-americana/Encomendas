'use strict';

// Gera build/icon.png e build/icon.ico a partir de build/icon.svg.
//   node tools/gen-icone.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const pasta = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(pasta, 'icon.svg'));
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];

/** ICO com as imagens em PNG dentro (aceite desde o Windows Vista). */
function ico(pngs) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(pngs.length, 4);

  const entradas = [];
  let deslocamento = 6 + 16 * pngs.length;
  for (const { tamanho, buffer } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0); // 0 quer dizer 256
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += buffer.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecalho, ...entradas, ...pngs.map((p) => p.buffer)]);
}

(async () => {
  const pngs = [];
  for (const tamanho of TAMANHOS) {
    const buffer = await sharp(svg, { density: 384 }).resize(tamanho, tamanho).png().toBuffer();
    pngs.push({ tamanho, buffer });
  }
  fs.writeFileSync(path.join(pasta, 'icon.ico'), ico(pngs));
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(path.join(pasta, 'icon.png'));
  // A janela da app usa a mesma imagem; fica dentro de src para entrar no pacote.
  fs.copyFileSync(path.join(pasta, 'icon.png'), path.join(__dirname, '..', 'src', 'icon.png'));
  console.log(`icon.ico (${TAMANHOS.join(', ')}) e icon.png escritos em ${pasta}`);
})();
