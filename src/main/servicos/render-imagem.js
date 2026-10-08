'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { BrowserWindow } = require('electron');

/**
 * Passa HTML a PNG numa janela que nunca aparece. E o mesmo Chromium do resto
 * da app, por isso as letras e as sombras saem como no ecra.
 *
 * - `offscreen` porque uma janela escondida normal nao repinta, e a captura
 *   devolvia o fotograma anterior (ver tools/smoke.js).
 * - Uma janela por pedido, reaproveitada para todas as imagens dele: criar
 *   uma nova logo a seguir a destruir a anterior fazia o carregamento falhar
 *   com ERR_FAILED. E fecha-se no fim, porque uma janela escondida aberta
 *   impedia a app de sair quando se fecha a principal.
 */
async function paraPngs(htmls, { largura = 1080 } = {}) {
  const janela = new BrowserWindow({
    show: false,
    width: largura,
    height: 800,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  janela.webContents.setFrameRate(10);

  try {
    const pngs = [];
    for (const html of htmls) pngs.push(await capturar(janela, html, largura));
    return pngs;
  } finally {
    if (!janela.isDestroyed()) janela.destroy();
  }
}

async function paraPng(html, opcoes) {
  return (await paraPngs([html], opcoes))[0];
}

async function capturar(janela, html, largura) {
  // Um ficheiro e nao um data URL: com as fotos todas la dentro passa os
  // limites de tamanho de um URL.
  const temp = path.join(os.tmpdir(), `encomendas-img-${crypto.randomBytes(6).toString('hex')}.html`);
  fs.writeFileSync(temp, html);

  try {
    await janela.loadFile(temp);

    // Espera pelas letras e pelas fotos antes de medir; senao a altura e a de
    // uma pagina ainda sem imagens.
    const altura = await janela.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
      return Math.ceil(document.documentElement.scrollHeight);
    })()`);

    janela.setContentSize(largura, altura);
    // O redimensionar so chega ao ecra no fotograma seguinte.
    await new Promise((r) => setTimeout(r, 300));
    const imagem = await janela.webContents.capturePage({ x: 0, y: 0, width: largura, height: altura });
    return imagem.toPNG();
  } finally {
    fs.rm(temp, { force: true }, () => {});
  }
}

module.exports = { paraPng, paraPngs };
