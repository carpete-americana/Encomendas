const fs = require('fs'), os = require('os'), path = require('path');
const { app, BrowserWindow, dialog } = require('electron');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-dup-'));
app.setPath('userData', pasta);
const db = require('../src/main/db');
const { registarIpc } = require('../src/main/ipc');
// Conta os exploradores do Windows em vez de os abrir.
let dialogos = 0;
dialog.showOpenDialog = async () => { dialogos++; return { canceled: true, filePaths: [] }; };
dialog.showSaveDialog = async () => { dialogos++; return { canceled: true }; };
app.whenReady().then(async () => {
  db.abrir(pasta);
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '..', 'src/main/preload.js') } });
  registarIpc({ janela: () => w });
  await w.loadFile(path.join(__dirname, '..', 'src/renderer/index.html'));
  const js = (c) => w.webContents.executeJavaScript(c);
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));
  // Dados para as paginas terem botoes em todas as linhas.
  const e = await js("(async()=>{const e=await window.api.chamar('encomendas.criar',{data:'2026-09-21'});await window.api.chamar('linhas.adicionar',e.id,{cliente_nome:'A',camisola_nome:'Kit',preco_fornecedor:1000});return e})()");
  const casos = [
    ['#/painel', '[data-importar]'], ['#/painel', '[data-nova]'],
    ['#/encomendas', '[data-importar]'], ['#/encomendas', '[data-nova]'],
    ['#/catalogo', '[data-nova]'], ['#/catalogo', '[data-abrir]'],
    ['#/clientes', '[data-novo]'], ['#/clientes', '[data-editar]'],
    ['#/definicoes', '[data-pasta]'], ['#/definicoes', '[data-importar]'],
    [`#/encomenda/${e.id}`, '[data-editar]'], [`#/encomenda/${e.id}`, '[data-exportar]'],
  ];
  let falhas = 0;
  for (const [rota, botao] of casos) {
    for (let i = 0; i < 5; i++) { await js("location.hash='#/rota-x'"); await esp(250); await js(`location.hash='${rota}'`); await esp(450); }
    // Tambem um redesenho dentro da propria pagina (o que o catalogo e o detalhe fazem).
    dialogos = 0;
    await js(`document.querySelector('${botao}').click()`);
    await esp(900);
    const modais = await js("document.querySelectorAll('.fundo-modal').length");
    const total = modais + dialogos;
    const ok = total === 1;
    if (!ok) falhas++;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${rota.padEnd(14)} ${botao.padEnd(18)} -> ${modais} janela(s) + ${dialogos} explorador(es)`);
    await js("document.querySelectorAll('.fundo-modal').forEach(m=>m.remove())");
  }
  db.fechar(); fs.rmSync(pasta, { recursive: true, force: true }); app.exit(falhas ? 1 : 0);
});
