'use strict';

const path = require('path');
const os = require('os');
const { ipcMain, dialog, shell, app } = require('electron');

const db = require('./db');
const definicoes = require('./db/repos/definicoes');
const camisolas = require('./db/repos/camisolas');
const clientes = require('./db/repos/clientes');
const encomendas = require('./db/repos/encomendas');
const fotos = require('./servicos/fotos');
const { exportar, nomeSugerido } = require('./servicos/exportar');
const { analisar, importar } = require('./servicos/importar');
const copias = require('./servicos/copias');
const { calcularTotais } = require('./servicos/totais');

function pastaExportacao() {
  const definida = definicoes.ler('pasta_exportacao', '');
  return definida && definida.trim() ? definida : path.join(os.homedir(), 'Desktop');
}

function registarIpc({ janela }) {
  /** Lista fechada: um metodo que nao esteja aqui e recusado. */
  const METODOS = {
    // --- aplicacao -------------------------------------------------------
    'app.info': () => ({
      versao: app.getVersion(),
      pastaDados: app.getPath('userData'),
      base: db.caminhos().base,
      estados: encomendas.ESTADOS,
      estadosChegada: encomendas.ESTADOS_CHEGADA
    }),
    'app.abrirPastaDados': () => shell.openPath(app.getPath('userData')),

    // --- definicoes ------------------------------------------------------
    'definicoes.mapa': () => definicoes.mapa(),
    'definicoes.todas': () => definicoes.todas(),
    'definicoes.gravar': (valores) => definicoes.gravarVarias(valores),
    'definicoes.tamanhos': () => definicoes.tamanhos(),
    'definicoes.escolherPasta': async () => {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Pasta onde guardar os Excel',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: pastaExportacao()
      });
      if (r.canceled || !r.filePaths[0]) return null;
      definicoes.gravar('pasta_exportacao', r.filePaths[0]);
      return r.filePaths[0];
    },

    // --- catalogo --------------------------------------------------------
    'camisolas.listar': (opcoes) => camisolas.listar(opcoes || {}),
    'camisolas.porId': (id) => camisolas.porId(id),
    'camisolas.criar': (dados) => camisolas.criarOuObter(dados),
    'camisolas.atualizar': (id, dados) => camisolas.atualizar(id, dados),
    'camisolas.historico': (id) => camisolas.historico(id),
    'camisolas.apagar': (id) => camisolas.apagar(id),
    'camisolas.precosComEstampagem': () => camisolas.precosComEstampagemIncluida({
      nomeNumero: definicoes.ler('estampagem_nome_numero', 0),
      soUm: definicoes.ler('estampagem_so_um', 0)
    }),
    'camisolas.corrigirPrecos': (lista) => {
      copias.criar('antes-de-corrigir-precos');
      return camisolas.corrigirPrecos(lista);
    },
    'camisolas.fundir': (idFica, idsJuntar) => {
      copias.criar('antes-de-juntar');
      return camisolas.fundir(idFica, idsJuntar);
    },
    'camisolas.escolherFoto': async (id) => {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Escolher a foto da camisola',
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }]
      });
      if (r.canceled || !r.filePaths[0]) return null;
      const nome = await fotos.guardarDeFicheiro(r.filePaths[0], { maxPx: definicoes.ler('foto_max_px', 420) });
      if (id) camisolas.atualizar(id, { foto: nome });
      return nome;
    },
    'camisolas.limparFotosOrfas': () => {
      const usadas = camisolas.listar({ incluirArquivadas: true }).map((c) => c.foto);
      return fotos.limparOrfas(usadas);
    },

    // --- clientes --------------------------------------------------------
    'clientes.listar': (opcoes) => clientes.listar(opcoes || {}),
    'clientes.porId': (id) => clientes.porId(id),
    'clientes.criar': (dados) => clientes.criarOuObter(dados),
    'clientes.atualizar': (id, dados) => clientes.atualizar(id, dados),
    'clientes.historico': (id) => clientes.historico(id),
    'clientes.apagar': (id) => clientes.apagar(id),

    // --- encomendas ------------------------------------------------------
    'encomendas.listar': () => encomendas.listar(),
    'encomendas.porId': (id) => encomendas.porId(id),
    'encomendas.criar': (dados) => encomendas.criar(dados || {}),
    'encomendas.atualizar': (id, dados) => encomendas.atualizar(id, dados),
    'encomendas.apagar': (id) => {
      copias.criar('antes-de-apagar-encomenda');
      return encomendas.apagar(id);
    },

    'linhas.adicionar': (encomendaId, dados) => encomendas.adicionarLinha(encomendaId, dados),
    'linhas.atualizar': (id, dados) => encomendas.atualizarLinha(id, dados),
    'linhas.apagar': (id) => encomendas.apagarLinha(id),
    'linhas.duplicar': (id) => encomendas.duplicarLinha(id),
    'linhas.marcarBloco': (encomendaId, clienteId, dados) => encomendas.marcarBloco(encomendaId, clienteId, dados),
    'linhas.reordenar': (encomendaId, ids) => encomendas.reordenar(encomendaId, ids),

    // --- exportacao ------------------------------------------------------
    'exportar.encomenda': async (id, { perguntar = true } = {}) => {
      const encomenda = encomendas.porId(id);
      if (!encomenda) throw new Error('Encomenda nao encontrada.');
      if (!encomenda.totais.nCamisolas) throw new Error('Esta encomenda ainda nao tem camisolas.');

      let destino = path.join(pastaExportacao(), nomeSugerido(encomenda));
      if (perguntar) {
        const r = await dialog.showSaveDialog(janela(), {
          title: 'Guardar o Excel para o fornecedor',
          defaultPath: destino,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        });
        if (r.canceled || !r.filePath) return null;
        destino = r.filePath;
      }

      const resultado = await exportar(encomenda, destino, {
        titulo: definicoes.ler('titulo_exportacao'),
        alturaLinha: definicoes.ler('export_altura_linha'),
        alturaFoto: definicoes.ler('export_foto_altura')
      });
      return resultado;
    },
    'exportar.mostrarNaPasta': (caminho) => shell.showItemInFolder(caminho),
    'exportar.abrir': (caminho) => shell.openPath(caminho),

    // --- importacao ------------------------------------------------------
    'importar.escolherFicheiro': async () => {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Escolher o Excel a importar',
        properties: ['openFile'],
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
        defaultPath: path.join(os.homedir(), 'Desktop')
      });
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
    'importar.analisar': async (caminho) => {
      const a = await analisar(caminho);
      delete a._wb; // o livro inteiro nao atravessa o IPC
      return {
        ...a,
        clientes: a.clientes.map((c) => ({
          nome: c.nome,
          itens: c.itens.map(({ imageId, ...i }) => ({ ...i, temFoto: imageId !== undefined }))
        }))
      };
    },
    'importar.importar': (caminho, opcoes) => {
      copias.criar('antes-de-importar');
      return importar(caminho, opcoes || {});
    },

    // --- copias de seguranca ---------------------------------------------
    'copias.listar': () => copias.listar(),
    'copias.criar': () => copias.criar('manual'),
    'copias.restaurar': (caminho) => copias.restaurar(caminho),
    'copias.abrirPasta': () => shell.openPath(copias.pasta()),
    'copias.exportar': async () => {
      const r = await dialog.showOpenDialog(janela(), {
        title: 'Onde guardar a cópia',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Guardar aqui'
      });
      if (r.canceled || !r.filePaths[0]) return null;
      return copias.exportarPara(r.filePaths[0]);
    },

    // --- painel ----------------------------------------------------------
    'painel.resumo': () => {
      const lista = encomendas.listar();
      const todasLinhas = lista.flatMap((e) => encomendas.linhasDe(e.id));
      const abertas = lista.filter((e) => !['fechada', 'entregue'].includes(e.estado));
      return {
        encomendas: lista.length,
        encomendasAbertas: abertas.length,
        catalogo: camisolas.listar({ incluirArquivadas: false }).length,
        clientes: clientes.listar().length,
        historico: calcularTotais(todasLinhas),
        emCurso: calcularTotais(abertas.flatMap((e) => encomendas.linhasDe(e.id)))
      };
    }
  };

  ipcMain.handle('chamar', async (_evento, metodo, ...args) => {
    const fn = METODOS[metodo];
    if (!fn) throw new Error(`Metodo desconhecido: ${metodo}`);
    try {
      return await fn(...args);
    } catch (erro) {
      // A mensagem tem de chegar ao ecra legivel; o resto vai para a consola.
      console.error(`[ipc] ${metodo}:`, erro);
      throw new Error(erro.message || 'Erro inesperado.');
    }
  });
}

module.exports = { registarIpc };
