'use strict';

const path = require('path');
const ExcelJS = require('exceljs');
const { base, transacao } = require('../db');
const camisolasRepo = require('../db/repos/camisolas');
const clientesRepo = require('../db/repos/clientes');
const encomendasRepo = require('../db/repos/encomendas');
const definicoes = require('../db/repos/definicoes');
const fotos = require('./fotos');
const { limpar } = require('./texto');
const { paraCentimos } = require('./dinheiro');

/**
 * Le um Excel no formato antigo (o que eu fazia a mao) e semeia a base.
 * Estrutura esperada: titulo na linha 1, depois blocos de
 * <nome do cliente> / <cabecalho ITEM...> / <itens de 4 em 4 linhas>.
 */

const COL = { item: 1, tamanho: 4, personalizacao: 6, nomeNumero: 8, precoFornecedor: 12, precoCliente: 14 };
const COL_FOTO_MIN = 5; // a coluna 0 e o logotipo do cabecalho, nao uma camisola

/** O valor de uma celula pode vir como texto, numero, rich text ou formula. */
function valor(celula) {
  const v = celula ? celula.value : null;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
    if ('result' in v) return v.result ?? '';
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

function texto(celula) {
  return limpar(valor(celula));
}

function ehSim(bruto) {
  const t = String(bruto || '').trim().toLowerCase();
  return t === 'sim' || t === 's' || t === 'yes' || t === 'x';
}

function dataDoTitulo(titulo, caminho) {
  const deTitulo = String(titulo || '').match(/(\d{2})[/\-.](\d{2})[/\-.](\d{4})/);
  if (deTitulo) return `${deTitulo[3]}-${deTitulo[2]}-${deTitulo[1]}`;
  const doNome = path.basename(caminho || '').match(/(\d{2})[_\-.](\d{2})[_\-.](\d{4})/);
  if (doNome) return `${doNome[3]}-${doNome[2]}-${doNome[1]}`;
  return new Date().toISOString().slice(0, 10);
}

/** Lê o ficheiro e devolve a estrutura, sem escrever nada. */
async function analisar(caminho) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('O ficheiro nao tem nenhuma folha.');

  const titulo = texto(ws.getCell(1, COL.item)) || path.basename(caminho, '.xlsx');
  const avisos = [];

  // 1) Ler os blocos de clientes e itens.
  const clientes = [];
  let atual = null;

  for (let r = 2; r <= ws.rowCount; r += 1) {
    const celula = ws.getCell(r, COL.item);

    // A celula do item esta fundida nas 4 linhas que a foto ocupa, e o exceljs
    // devolve o valor do mestre em todas elas. Sem isto cada camisola entrava
    // quatro vezes.
    if (celula.isMerged && celula.master && celula.master.row !== r) continue;

    const a = texto(celula);
    if (!a) continue;
    if (a.toUpperCase() === 'ITEM') continue; // cabecalho do bloco

    const seguinte = texto(ws.getCell(r + 1, COL.item)).toUpperCase();
    if (seguinte === 'ITEM') {
      atual = { nome: a, itens: [] };
      clientes.push(atual);
      continue;
    }

    if (!atual) {
      avisos.push(`Linha ${r}: "${a}" aparece antes de qualquer cliente e foi ignorada.`);
      continue;
    }

    const brutoTamanho = valor(ws.getCell(r, COL.tamanho));
    atual.itens.push({
      linhaExcel: r,
      nome: a,
      tamanho: limpar(typeof brutoTamanho === 'number' ? String(brutoTamanho) : brutoTamanho),
      personalizacao: ehSim(valor(ws.getCell(r, COL.personalizacao))),
      personalizacaoTexto: texto(ws.getCell(r, COL.nomeNumero)),
      precoFornecedor: paraCentimos(valor(ws.getCell(r, COL.precoFornecedor))),
      precoCliente: paraCentimos(valor(ws.getCell(r, COL.precoCliente))),
      foto: null
    });
  }

  // 2) Ligar cada imagem ao item. A ancora cai na propria linha do item ou
  //    uma acima; e a unica regra que cobre as 64 imagens do ficheiro real.
  const porLinha = new Map();
  for (const c of clientes) for (const i of c.itens) porLinha.set(i.linhaExcel, i);

  const reclamadas = new Set();
  const imagensSoltas = [];

  for (const img of ws.getImages()) {
    if (img.range.tl.nativeCol < COL_FOTO_MIN) continue; // logotipo
    const linhaAncora = img.range.tl.nativeRow + 1;
    const alvo = [linhaAncora, linhaAncora + 1].find((l) => porLinha.has(l) && !reclamadas.has(l));

    if (alvo === undefined) {
      imagensSoltas.push(linhaAncora);
      continue;
    }
    reclamadas.add(alvo);
    porLinha.get(alvo).imageId = img.imageId;
  }

  if (imagensSoltas.length) {
    avisos.push(
      `${imagensSoltas.length} imagem(ns) nao foi possivel associar a nenhuma camisola ` +
      `(linhas ${imagensSoltas.join(', ')}). Ficam de fora em vez de serem adivinhadas.`
    );
  }

  const totalItens = clientes.reduce((t, c) => t + c.itens.length, 0);
  const semFoto = clientes.flatMap((c) => c.itens.filter((i) => i.imageId === undefined).map((i) => i.nome));

  return {
    caminho,
    titulo,
    data: dataDoTitulo(titulo, caminho),
    clientes,
    avisos,
    resumo: {
      clientes: clientes.length,
      camisolas: totalItens,
      comFoto: totalItens - semFoto.length,
      semFoto: semFoto.length,
      totalFornecedor: clientes.flatMap((c) => c.itens).reduce((t, i) => t + (i.precoFornecedor || 0), 0),
      totalCliente: clientes.flatMap((c) => c.itens).reduce((t, i) => t + (i.precoCliente || 0), 0)
    },
    _wb: wb
  };
}

/** Analisa e escreve: clientes, catalogo com fotos, e a encomenda com as linhas. */
async function importar(caminho, { substituir = false } = {}) {
  const analise = await analisar(caminho);
  const wb = analise._wb;

  const jaExiste = base().get('SELECT id FROM encomendas WHERE titulo = ? AND data = ?', [
    analise.titulo, analise.data
  ]);
  if (jaExiste && !substituir) {
    throw new Error(`Ja existe a encomenda "${analise.titulo}" de ${analise.data}. Apaga-a primeiro ou pede para substituir.`);
  }

  // As fotos saem da transacao: sao ficheiros em disco e o sharp e assincrono.
  const maxPx = definicoes.ler('foto_max_px', 420);
  const fotoPorImageId = new Map();
  for (const c of analise.clientes) {
    for (const i of c.itens) {
      if (i.imageId === undefined) continue;
      if (!fotoPorImageId.has(i.imageId)) {
        const media = wb.getImage(Number(i.imageId));
        const nome = media && media.buffer ? await fotos.guardar(media.buffer, { maxPx }) : null;
        fotoPorImageId.set(i.imageId, nome);
      }
      i.foto = fotoPorImageId.get(i.imageId);
    }
  }

  return transacao(() => {
    if (jaExiste) encomendasRepo.apagar(jaExiste.id);

    const encomenda = encomendasRepo.criar({
      titulo: analise.titulo,
      data: analise.data,
      notas: `Importada de ${path.basename(caminho)}`
    });

    let criadasCamisolas = 0;
    let reaproveitadas = 0;

    for (const c of analise.clientes) {
      const cliente = clientesRepo.criarOuObter({ nome: c.nome });

      for (const i of c.itens) {
        const antes = camisolasRepo.porChave(i.nome);
        const camisola = camisolasRepo.criarOuObter({
          nome: i.nome,
          foto: i.foto,
          preco_fornecedor: i.precoFornecedor
        });
        if (antes) reaproveitadas += 1; else criadasCamisolas += 1;

        encomendasRepo.adicionarLinha(encomenda.id, {
          cliente_id: cliente.id,
          camisola_id: camisola.id,
          tamanho: i.tamanho || null,
          personalizacao: i.personalizacao,
          personalizacao_texto: i.personalizacaoTexto || null,
          // Os precos vem do ficheiro tal e qual: e o que foi cobrado na altura,
          // e nao o que a margem de hoje diria. Ja incluem a estampagem.
          preco_fornecedor: i.precoFornecedor ?? 0,
          preco_cliente: i.precoCliente ?? 0,
          precos_finais: true
        });
      }
    }

    const final = encomendasRepo.porId(encomenda.id);
    return {
      encomenda_id: encomenda.id,
      titulo: analise.titulo,
      data: analise.data,
      clientes: analise.clientes.length,
      camisolas: final.totais.nCamisolas,
      camisolasNovasNoCatalogo: criadasCamisolas,
      camisolasJaConhecidas: reaproveitadas,
      fotosGuardadas: new Set([...fotoPorImageId.values()].filter(Boolean)).size,
      semFoto: analise.resumo.semFoto,
      totais: final.totais,
      avisos: analise.avisos
    };
  });
}

module.exports = { analisar, importar, dataDoTitulo, ehSim };
