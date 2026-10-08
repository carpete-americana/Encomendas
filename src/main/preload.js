'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * O renderer nao tem Node nenhum. Fala com o processo principal por um canal
 * so, e o `ipc.js` do lado de la tem a lista fechada de metodos que aceita.
 */
contextBridge.exposeInMainWorld('api', {
  chamar: (metodo, ...args) => ipcRenderer.invoke('chamar', metodo, ...args),

  aoAtualizacao: (callback) => {
    ipcRenderer.on('atualizacao', (_e, estado) => callback(estado));
  },

  aoAtalho: (callback) => {
    const canais = ['atalho:nova-encomenda', 'atalho:importar', 'atalho:pagina'];
    for (const c of canais) {
      ipcRenderer.on(c, (_e, ...args) => callback(c.replace('atalho:', ''), ...args));
    }
  }
});
