'use strict';

const { app } = require('electron');

/**
 * Atualizacoes automaticas a partir das Releases do GitHub. A versao nova
 * descarrega-se sozinha em segundo plano; instala-se quando se carrega em
 * "Reiniciar e instalar", ou ao fechar a app.
 *
 * Os dados ficam em %APPDATA%\Encomendas, fora da pasta da app, por isso uma
 * atualizacao nao lhes toca. Mesmo assim fica uma copia de seguranca antes.
 */

const HORAS_ENTRE_VERIFICACOES = 6;

let estado = { fase: 'parada', versaoNova: null, progresso: 0, erro: null, verificadaEm: null };
let aoMudar = () => {};
let atualizador = null;

function mudar(dados) {
  estado = { ...estado, ...dados };
  aoMudar(estado);
}

/** So corre na app instalada: em `npm start` nao ha instalador para atualizar. */
function disponivel() {
  return app.isPackaged;
}

function iniciar({ notificar }) {
  aoMudar = notificar || (() => {});
  if (!disponivel()) {
    estado = { ...estado, fase: 'dev' };
    return;
  }

  ({ autoUpdater: atualizador } = require('electron-updater'));
  atualizador.autoDownload = true;
  atualizador.autoInstallOnAppQuit = true;

  atualizador.on('checking-for-update', () => mudar({ fase: 'a-procurar', erro: null }));
  atualizador.on('update-not-available', () => mudar({ fase: 'atualizada', verificadaEm: Date.now() }));
  atualizador.on('update-available', (info) => mudar({
    fase: 'a-descarregar', versaoNova: info.version, progresso: 0, verificadaEm: Date.now()
  }));
  atualizador.on('download-progress', (p) => mudar({ fase: 'a-descarregar', progresso: Math.round(p.percent || 0) }));
  atualizador.on('update-downloaded', (info) => mudar({ fase: 'pronta', versaoNova: info.version, progresso: 100 }));
  atualizador.on('error', (erro) => mudar({ fase: 'erro', erro: legivel(erro) }));

  // Uns segundos depois de abrir, para nao atrasar o arranque; e depois de
  // tempos a tempos, para quem deixa a app aberta o dia todo.
  setTimeout(procurar, 8000);
  setInterval(procurar, HORAS_ENTRE_VERIFICACOES * 3600 * 1000);
}

function legivel(erro) {
  const m = String(erro?.message || erro || '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET|net::/i.test(m)) return 'Sem ligação à internet.';
  if (/404/.test(m)) return 'Ainda não há nenhuma versão publicada.';
  return m.split('\n')[0].slice(0, 200) || 'Erro desconhecido.';
}

async function procurar() {
  if (!atualizador) return estado;
  if (['a-procurar', 'a-descarregar', 'pronta'].includes(estado.fase)) return estado;
  try {
    await atualizador.checkForUpdates();
  } catch (erro) {
    mudar({ fase: 'erro', erro: legivel(erro) });
  }
  return estado;
}

function instalar() {
  if (!atualizador || estado.fase !== 'pronta') throw new Error('Ainda não há nenhuma versão nova descarregada.');
  require('./copias').criar('antes-de-atualizar');
  // Fecha as janelas, instala sem perguntas e volta a abrir a app.
  setImmediate(() => atualizador.quitAndInstall(true, true));
  return true;
}

function ler() {
  return { ...estado, ...(disponivel() ? {} : { fase: 'dev' }), versao: app.getVersion() };
}

module.exports = { iniciar, procurar, instalar, ler };
