'use strict';

const path = require('path');
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const db = require('./db');
const fotos = require('./servicos/fotos');
const { registarIpc } = require('./ipc');

const DEV = process.argv.includes('--dev');

// As fotos sao servidas por um esquema proprio em vez de irem em base64 para o
// renderer: o catalogo mostra dezenas de uma vez e o browser guarda-as em cache.
protocol.registerSchemesAsPrivileged([
  { scheme: 'foto', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
]);

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0e0e18',
    show: false,
    autoHideMenuBar: true,
    title: 'Encomendas',
    icon: path.join(__dirname, '..', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  janela.once('ready-to-show', () => janela.show());
  janela.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (DEV) {
    janela.webContents.openDevTools({ mode: 'detach' });
    // Sem isto um erro do renderer fica so nas ferramentas do browser, e a
    // janela aparece meia vazia sem dizer porque.
    janela.webContents.on('console-message', (e) => {
      const nivel = ['debug', 'info', 'aviso', 'ERRO'][e.level] ?? e.level;
      console.log(`[renderer/${nivel}] ${e.message}  (${e.sourceId}:${e.lineNumber})`);
    });
  }

  // Um link externo abre no browser, nunca dentro da app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Ficheiro',
      submenu: [
        { label: 'Nova encomenda', accelerator: 'CmdOrCtrl+N', click: () => enviar('atalho:nova-encomenda') },
        { label: 'Importar Excel...', accelerator: 'CmdOrCtrl+I', click: () => enviar('atalho:importar') },
        { type: 'separator' },
        { label: 'Abrir pasta dos dados', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Encomendas', accelerator: 'CmdOrCtrl+1', click: () => enviar('atalho:pagina', 'encomendas') },
        { label: 'Catalogo', accelerator: 'CmdOrCtrl+2', click: () => enviar('atalho:pagina', 'catalogo') },
        { label: 'Clientes', accelerator: 'CmdOrCtrl+3', click: () => enviar('atalho:pagina', 'clientes') },
        { label: 'Definicoes', accelerator: 'CmdOrCtrl+4', click: () => enviar('atalho:pagina', 'definicoes') },
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas de programador' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamanho normal' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { role: 'togglefullscreen', label: 'Ecra inteiro' }
      ]
    }
  ]));
}

function enviar(canal, ...args) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, ...args);
}

// Uma instancia so: duas a escrever na mesma base podiam estraga-la, e cada
// uma continuava a correr o codigo que tinha quando abriu.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  db.abrir(app.getPath('userData'));
  // Uma copia por dia de trabalho, antes de a app ser usada.
  require('./servicos/copias').automatica();

  protocol.handle('foto', (pedido) => {
    const nome = decodeURIComponent(new URL(pedido.url).hostname || new URL(pedido.url).pathname.replace(/^\//, ''));
    const caminho = fotos.caminhoDe(nome);
    if (!caminho) return new Response('', { status: 404 });
    return net.fetch(`file://${caminho.replace(/\\/g, '/')}`);
  });

  registarIpc({ janela: () => janela });
  menu();
  criarJanela();
  require('./servicos/atualizacoes').iniciar({ notificar: (estado) => enviar('atualizacao', estado) });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  db.fechar();
  if (process.platform !== 'darwin') app.quit();
});
