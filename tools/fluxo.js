'use strict';

/**
 * Conduz o interface a serio, numa base descartavel: cria uma encomenda,
 * acrescenta linhas pelo formulario, edita-as em linha, marca chegadas e
 * exporta. E o que os testes de node nao veem - os eventos do ecra.
 *
 *   npx electron tools/fluxo.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, protocol, net } = require('electron');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-fluxo-'));
app.setPath('userData', pasta);

const db = require('../src/main/db');
const fotos = require('../src/main/servicos/fotos');
const { registarIpc } = require('../src/main/ipc');

protocol.registerSchemesAsPrivileged([
  { scheme: 'foto', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const falhas = [];
let passos = 0;

function verificar(descricao, condicao, detalhe = '') {
  passos += 1;
  if (condicao) {
    console.log(`  ok   ${descricao}`);
  } else {
    falhas.push(`${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
    console.log(`  FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  db.abrir(pasta);

  protocol.handle('foto', (pedido) => {
    const nome = decodeURIComponent(new URL(pedido.url).hostname);
    const caminho = fotos.caminhoDe(nome);
    return caminho ? net.fetch(`file://${caminho.replace(/\\/g, '/')}`) : new Response('', { status: 404 });
  });

  const janela = new BrowserWindow({
    width: 1440, height: 940, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'), contextIsolation: true }
  });
  registarIpc({ janela: () => janela });

  janela.webContents.on('console-message', (e) => {
    if (e.level >= 3) falhas.push(`consola: ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });

  await janela.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  const js = (codigo) => janela.webContents.executeJavaScript(codigo);
  // O executeJavaScript nao aceita `await` de topo: uma expressao que espera
  // por uma chamada IPC tem de vir dentro de uma funcao assincrona.
  const jsA = (expressao) => janela.webContents.executeJavaScript(`(async () => (${expressao}))()`);

  // ---------------------------------------------------------------------
  console.log('\nCriar uma encomenda e abri-la');
  const encomenda = await js("window.api.chamar('encomendas.criar', { data: '2026-09-20', titulo: 'Teste' })");
  await js(`location.hash = '#/encomenda/${encomenda.id}'`);
  await esperar(800);
  verificar('a pagina abriu no titulo certo',
    (await js("document.querySelector('[data-titulo]').textContent")) === 'Teste');

  // ---------------------------------------------------------------------
  console.log('\nAdicionar uma camisola pelo formulario');
  await js(`(() => {
    const f = document.querySelector('[data-form]');
    f.querySelector('[name="cliente"]').value = 'Tiago Bastos';
    f.querySelector('[name="camisola"]').value = 'Portugal 2026 Home Kit';
    f.querySelector('[name="tamanho"]').value = 'L';
    f.querySelector('[name="preco"]').value = '10';
    f.querySelector('[data-adicionar]').click();
  })()`);
  await esperar(900);

  verificar('apareceu um grupo de cliente',
    (await js("document.querySelectorAll('[data-grupo]').length")) === 1);
  verificar('apareceu uma linha',
    (await js("document.querySelectorAll('[data-linha]').length")) === 1);
  verificar('o cliente foi criado com o nome escrito',
    (await js("document.querySelector('[data-grupo] .nome').textContent.trim()")) === 'Tiago Bastos');

  const precos = await js(`(() => {
    const tr = document.querySelector('[data-linha]');
    return {
      fornecedor: tr.querySelector('[data-campo="preco_fornecedor"]').value,
      cliente: tr.querySelector('[data-campo="preco_cliente"]').value
    };
  })()`);
  verificar('o preco ao cliente saiu do fornecedor mais a margem de 4',
    precos.fornecedor === '10,00' && precos.cliente === '14,00',
    `fornecedor=${precos.fornecedor} cliente=${precos.cliente}`);

  verificar('o campo da camisola limpou-se para a proxima',
    (await js("document.querySelector('[name=\"camisola\"]').value")) === '');
  verificar('o cliente ficou preenchido para a proxima',
    (await js("document.querySelector('[name=\"cliente\"]').value")) === 'Tiago Bastos');

  // ---------------------------------------------------------------------
  console.log('\nA camisola ficou no catalogo');
  const catalogo = await js("window.api.chamar('camisolas.listar', {})");
  verificar('o catalogo tem a camisola nova', catalogo.length === 1 && catalogo[0].nome === 'Portugal 2026 Home Kit');
  verificar('e guardou o preco de fornecedor', catalogo[0].preco_fornecedor === 1000);

  // ---------------------------------------------------------------------
  console.log('\nSegunda camisola, agora escolhida do catalogo');
  await js(`(() => {
    const f = document.querySelector('[data-form]');
    f.querySelector('[name="camisola"]').value = 'Portugal 2026 Home Kit';
    f.querySelector('[name="camisola_id"]').value = '${''}' || ${catalogo[0].id};
    f.querySelector('[name="tamanho"]').value = 'M';
    f.querySelector('[data-adicionar]').click();
  })()`);
  await esperar(900);
  verificar('ficaram duas linhas no mesmo grupo',
    (await js("document.querySelectorAll('[data-linha]').length")) === 2);
  verificar('continua a haver um so cliente',
    (await js("document.querySelectorAll('[data-grupo]').length")) === 1);
  verificar('o catalogo NAO duplicou a camisola',
    (await jsA("(await window.api.chamar('camisolas.listar', {})).length")) === 1);

  // ---------------------------------------------------------------------
  console.log('\nEditar uma linha no proprio ecra');
  await js(`(() => {
    const tr = document.querySelectorAll('[data-linha]')[0];
    const campo = tr.querySelector('[data-campo="tamanho"]');
    campo.value = 'XL';
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await esperar(700);
  verificar('o tamanho novo ficou gravado',
    (await js("document.querySelectorAll('[data-linha]')[0].querySelector('[data-campo=\"tamanho\"]').value")) === 'XL');
  verificar('o resumo contou o tamanho novo',
    (await js("[...document.querySelectorAll('.contagem-tam .tam')].map(s => s.textContent).includes('XL')")));

  console.log('\nLigar a personalizacao abre o campo do nome');
  await js(`(() => {
    const tr = document.querySelectorAll('[data-linha]')[0];
    const c = tr.querySelector('[data-campo="personalizacao"]');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await esperar(700);
  verificar('o campo do nome deixou de estar bloqueado',
    (await js("document.querySelectorAll('[data-linha]')[0].querySelector('[data-campo=\"personalizacao_texto\"]').disabled")) === false);

  console.log('\nMudar o preco ao cliente a mao');
  await js(`(() => {
    const tr = document.querySelectorAll('[data-linha]')[0];
    const campo = tr.querySelector('[data-campo="preco_cliente"]');
    campo.value = '20,50';
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await esperar(700);
  const totalCliente = await jsA(`(await window.api.chamar('encomendas.porId', ${encomenda.id})).totais.totalCliente`);
  verificar('o total ao cliente refez-se com o preco escrito a mao',
    totalCliente === 2050 + 1400, `deu ${totalCliente}`);

  // ---------------------------------------------------------------------
  console.log('\nMarcar o bloco todo como chegado e pago');
  await js("document.querySelector('[data-bloco-chegou]').click()");
  await esperar(700);
  await js("document.querySelector('[data-bloco-pago]').click()");
  await esperar(700);
  const depois = await jsA(`await window.api.chamar('encomendas.porId', ${encomenda.id})`);
  verificar('as duas linhas chegaram', depois.totais.chegaram === 2);
  verificar('as duas linhas estao pagas', depois.totais.nPagas === 2);
  verificar('nao ha nada por receber', depois.totais.porReceber === 0);

  // ---------------------------------------------------------------------
  console.log('\nDuplicar e apagar');
  await js("document.querySelector('[data-duplicar]').click()");
  await esperar(800);
  verificar('a duplicacao criou uma terceira linha',
    (await js("document.querySelectorAll('[data-linha]').length")) === 3);
  const copia = await jsA(`(await window.api.chamar('encomendas.porId', ${encomenda.id})).linhas[1]`);
  verificar('a copia nasce por chegar e por pagar', copia.estado_chegada === 'pendente' && copia.pago === false);

  await jsA(`await window.api.chamar('linhas.apagar', ${copia.id})`);
  await js(`location.hash = '#/painel'; location.hash = '#/encomenda/${encomenda.id}'`);
  await esperar(900);
  verificar('voltou a haver duas linhas',
    (await js("document.querySelectorAll('[data-linha]').length")) === 2);

  // ---------------------------------------------------------------------
  console.log('\nMudar o estado da encomenda');
  await js(`(() => {
    const s = document.querySelector('[data-estado]');
    s.value = 'enviada';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await esperar(700);
  verificar('o estado ficou gravado',
    (await jsA(`(await window.api.chamar('encomendas.porId', ${encomenda.id})).estado`)) === 'enviada');

  // ---------------------------------------------------------------------
  console.log('\nExportar sem perguntar o caminho');
  const destino = path.join(pasta, 'exportado.xlsx');
  const { exportar } = require('../src/main/servicos/exportar');
  const encomendas = require('../src/main/db/repos/encomendas');
  const r = await exportar(encomendas.porId(encomenda.id), destino, {});
  verificar('o ficheiro foi escrito', fs.existsSync(destino));
  verificar('levou as duas camisolas de um cliente', r.camisolas === 2 && r.clientes === 1);

  // ---------------------------------------------------------------------
  console.log('\nOutro cliente, e a margem propria dele');
  await jsA("await window.api.chamar('clientes.criar', { nome: 'Gabriel / Sara', margem_override: 0 })");
  await js(`location.hash = '#/painel'; location.hash = '#/encomenda/${encomenda.id}'`);
  await esperar(800);
  await js(`(() => {
    const f = document.querySelector('[data-form]');
    f.querySelector('[name="cliente"]').value = 'Gabriel / Sara';
    f.querySelector('[name="camisola"]').value = 'Sporting 2000/01';
    f.querySelector('[name="preco"]').value = '10';
    f.querySelector('[data-adicionar]').click();
  })()`);
  await esperar(900);
  const gs = await jsA(`(await window.api.chamar('encomendas.porId', ${encomenda.id})).grupos.find(g => g.cliente_nome === 'Gabriel / Sara')`);
  verificar('a linha dela foi ao custo, sem margem',
    gs && gs.linhas[0].preco_cliente === 1000 && gs.linhas[0].preco_fornecedor === 1000,
    gs ? `fornecedor=${gs.linhas[0].preco_fornecedor} cliente=${gs.linhas[0].preco_cliente}` : 'grupo nao encontrado');
  verificar('sao dois grupos agora',
    (await js("document.querySelectorAll('[data-grupo]').length")) === 2);

  // ---------------------------------------------------------------------
  console.log('\nCopiar a imagem de um cliente');
  const { clipboard } = require('electron');
  clipboard.clear();
  await js("document.querySelector('[data-imagem]').click()");
  let copiada = null;
  for (let i = 0; i < 40 && (!copiada || copiada.isEmpty()); i += 1) {
    await esperar(250);
    copiada = clipboard.readImage();
  }
  verificar('ficou uma imagem na area de transferencia', copiada && !copiada.isEmpty());
  verificar('com a largura da imagem para o WhatsApp', copiada && copiada.getSize().width === 1080,
    copiada ? JSON.stringify(copiada.getSize()) : '');
  verificar('nao abriu janela nenhuma', (await js("document.querySelectorAll('.fundo-modal').length")) === 0);

  // ---------------------------------------------------------------------
  console.log('\nColar a foto de uma camisola a partir do Ctrl+C');
  const { nativeImage } = require('electron');
  const sharp = require('sharp');
  const camisolaSemFoto = (await jsA("await window.api.chamar('camisolas.listar', {})"))
    .find((c) => c.nome === 'Sporting 2000/01');

  clipboard.clear();
  await js(`location.hash = '#/catalogo'`);
  await esperar(800);
  await js(`document.querySelector('[data-abrir="${camisolaSemFoto.id}"]').click()`);
  await esperar(700);
  await js("document.querySelector('[data-colar-foto]').click()");
  await esperar(700);
  verificar('sem imagem copiada avisa em vez de rebentar',
    (await js("[...document.querySelectorAll('.toast.erro')].some(t => t.textContent.includes('imagem copiada'))")));

  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#1E8C3A' } }).png().toBuffer();
  clipboard.writeImage(nativeImage.createFromBuffer(png));
  await js("document.querySelector('[data-colar-foto]').click()");
  await esperar(1200);
  verificar('a previa mostra a foto colada',
    (await js("document.querySelector('[data-previa]').style.backgroundImage")).startsWith('url('));
  await js("document.querySelector('.fundo-modal [data-ok]').click()");
  await esperar(800);
  const comFoto = await jsA(`await window.api.chamar('camisolas.porId', ${camisolaSemFoto.id})`);
  verificar('a camisola ficou com a foto colada', !!comFoto.foto);
  const dim = comFoto.foto ? await sharp(path.join(pasta, 'fotos', comFoto.foto)).metadata() : {};
  verificar('reduzida como as outras fotos', dim.width === 420, `${dim.width}x${dim.height}`);

  console.log('\nCtrl+V com a ficha aberta tambem cola a foto');
  const outra = (await jsA("await window.api.chamar('camisolas.listar', {})")).find((c) => !c.foto);
  await js(`document.querySelector('[data-abrir="${outra.id}"]').click()`);
  await esperar(700);
  const azul = await sharp({ create: { width: 300, height: 500, channels: 3, background: '#1D4ED8' } }).png().toBuffer();
  clipboard.writeImage(nativeImage.createFromBuffer(azul));
  await js("document.querySelector('.fundo-modal [name=\"nome\"]').focus()");
  const nomeAntes = await js("document.querySelector('.fundo-modal [name=\"nome\"]').value");
  janela.webContents.paste();
  await esperar(1200);
  verificar('o Ctrl+V meteu a foto na previa',
    (await js("document.querySelector('[data-previa]').style.backgroundImage")).startsWith('url('));
  verificar('e nao escreveu nada no campo do nome',
    (await js("document.querySelector('.fundo-modal [name=\"nome\"]').value")) === nomeAntes);
  await js("document.querySelector('.fundo-modal [data-ok]').click()");
  await esperar(800);

  // ---------------------------------------------------------------------
  console.log(`\n${passos - falhas.length}/${passos} verificacoes passaram.`);
  if (falhas.length) {
    console.log('\nFalhas:');
    falhas.forEach((f) => console.log('  -', f));
  }

  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
  app.exit(falhas.length ? 1 : 0);
});
