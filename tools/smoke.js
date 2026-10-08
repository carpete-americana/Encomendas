'use strict';

/**
 * Abre a app sem janela visivel, passa por todos os ecras e conta os erros.
 * Apanha o que os testes de node nao apanham: um import errado, um campo que
 * nao existe, um `null` a chegar ao HTML.
 *
 *   npx electron tools/smoke.js
 */

const path = require('path');
const { app, BrowserWindow, protocol, net } = require('electron');
const db = require('../src/main/db');
const fotos = require('../src/main/servicos/fotos');
const { registarIpc } = require('../src/main/ipc');
const encomendas = require('../src/main/db/repos/encomendas');
const clientes = require('../src/main/db/repos/clientes');

// Correr `electron tools/smoke.js` faz a app chamar-se "Electron" e apontar
// para outra pasta de dados, que esta vazia. Sem isto o teste passa a olhar
// para uma base sem nada e nao prova coisa nenhuma.
app.setName('Encomendas');

protocol.registerSchemesAsPrivileged([
  { scheme: 'foto', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const erros = [];

app.whenReady().then(async () => {
  db.abrir(app.getPath('userData'));

  protocol.handle('foto', (pedido) => {
    const nome = decodeURIComponent(new URL(pedido.url).hostname);
    const caminho = fotos.caminhoDe(nome);
    return caminho ? net.fetch(`file://${caminho.replace(/\\/g, '/')}`) : new Response('', { status: 404 });
  });

  const janela = new BrowserWindow({
    width: 1440,
    height: 940,
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'), contextIsolation: true }
  });
  registarIpc({ janela: () => janela });

  janela.webContents.on('console-message', (e) => {
    if (e.level >= 3) erros.push(`${e.message}  (${e.sourceId}:${e.lineNumber})`);
  });
  janela.webContents.on('render-process-gone', (_e, d) => erros.push(`renderer morreu: ${d.reason}`));

  await janela.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  // --claro / --escuro forca o tema; sem nenhum segue o Windows.
  const tema = process.argv.includes('--claro') ? 'claro' : process.argv.includes('--escuro') ? 'escuro' : null;
  // A pasta de dados e a verdadeira: guarda-se a escolha que la estava para a repor.
  const temaAntes = await janela.webContents.executeJavaScript("localStorage.getItem('tema')");
  if (tema) {
    await janela.webContents.executeJavaScript(`localStorage.setItem('tema', '${tema}')`);
    await janela.webContents.reload();
    await new Promise((r) => setTimeout(r, 900));
  }

  // Rotas com dados reais: a primeira encomenda e o primeiro cliente que houver.
  const primeiraEncomenda = encomendas.listar()[0];
  const primeiroCliente = clientes.listar()[0];

  const pastaFotos = path.join(__dirname, '..', '_ecras');
  if (process.argv.includes('--fotos')) require('fs').mkdirSync(pastaFotos, { recursive: true });

  const rotas = [
    '#/painel', '#/encomendas', '#/catalogo', '#/clientes', '#/definicoes',
    primeiraEncomenda ? `#/encomenda/${primeiraEncomenda.id}` : null,
    primeiroCliente ? `#/cliente/${primeiroCliente.id}` : null,
    '#/encomenda/999999', // inexistente, tem de dar um ecra e nao um erro
    '#/rota-que-nao-existe'
  ].filter(Boolean);

  for (const rota of rotas) {
    const antes = erros.length;
    await janela.webContents.executeJavaScript(`location.hash = ${JSON.stringify(rota)}`);
    await new Promise((r) => setTimeout(r, 700));

    const info = await janela.webContents.executeJavaScript(`(() => {
      const c = document.getElementById('conteudo');
      return {
        titulo: (c.querySelector('h1') || {}).textContent || '(sem titulo)',
        html: c.innerHTML.length,
        aCarregar: c.textContent.trim() === 'A carregar…'
      };
    })()`);

    const novos = erros.length - antes;
    const estado = novos ? `${novos} ERRO(S)` : info.aCarregar ? 'PRESO A CARREGAR' : 'ok';
    console.log(`${rota.padEnd(26)} ${String(info.titulo).slice(0, 34).padEnd(36)} ${String(info.html).padStart(7)} bytes  ${estado}`);

    if (process.argv.includes('--fotos')) {
      // Com a janela escondida o Electron nao repinta sozinho: a primeira
      // captura devolve o fotograma anterior e serve so para forcar o desenho.
      await janela.webContents.capturePage();
      await new Promise((r) => setTimeout(r, 350));
      const imagem = await janela.webContents.capturePage();
      const nome = (rota.replace(/[#/]/g, '_').replace(/^_+/, '') || 'raiz') + (tema ? `-${tema}` : '');
      require('fs').writeFileSync(path.join(pastaFotos, `${nome}.png`), imagem.toPNG());

      // Nas paginas compridas, uma segunda captura mais abaixo mostra as tabelas.
      const altura = await janela.webContents.executeJavaScript("document.querySelector('main').scrollHeight");
      if (altura > 1400) {
        await janela.webContents.executeJavaScript("document.querySelector('main').scrollTop = 760");
        await new Promise((r) => setTimeout(r, 250));
        await janela.webContents.capturePage();
        await new Promise((r) => setTimeout(r, 300));
        const abaixo = await janela.webContents.capturePage();
        require('fs').writeFileSync(path.join(pastaFotos, `${nome}-abaixo.png`), abaixo.toPNG());
        await janela.webContents.executeJavaScript("document.querySelector('main').scrollTop = 0");
      }
    }
  }

  console.log('');
  if (erros.length) {
    console.log(`${erros.length} erro(s):`);
    [...new Set(erros)].forEach((e) => console.log('  -', e));
  } else {
    console.log('Sem erros em nenhum ecra.');
  }

  await janela.webContents.executeJavaScript(temaAntes === null
    ? "localStorage.removeItem('tema')"
    : `localStorage.setItem('tema', ${JSON.stringify(temaAntes)})`);

  db.fechar();
  app.exit(erros.length ? 1 : 0);
});
