'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const fotos = require('./fotos');
const { nomeFicheiro } = require('./texto');

/**
 * Gera o Excel que vai para o fornecedor. A regra que manda em tudo o que esta
 * aqui: sai a lista de producao e mais nada. Nenhum preco, nenhum total,
 * nenhuma caixa de contas. O fornecedor nao tem nada que ver a margem.
 */

// A folha tem 4 linhas por camisola porque e a altura de que a foto precisa.
const LINHAS_POR_ITEM = 4;
const COL_FOTO = 10; // coluna J, a seguir ao texto

const COLUNAS = [
  { chave: 'item', titulo: 'ITEM', de: 1, ate: 3, largura: 34 },
  { chave: 'tamanho', titulo: 'TAMANHO', de: 4, ate: 5, largura: 11 },
  { chave: 'personalizacao', titulo: 'PERSONALIZAÇÃO', de: 6, ate: 7, largura: 16 },
  { chave: 'nome_numero', titulo: 'NOME - NUMERO - SIMBOLO', de: 8, ate: 9, largura: 17 }
];

const COR_TITULO = 'FF131320';
const COR_CLIENTE = 'FF6366F1';
const COR_CABECALHO = 'FFE8E8F5';
const BORDA = { style: 'thin', color: { argb: 'FFB9B9CC' } };

function letra(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function exportar(encomenda, destino, opcoes = {}) {
  const alturaLinha = Number(opcoes.alturaLinha) || 22;
  const alturaFoto = Number(opcoes.alturaFoto) || 108;
  const tituloTexto = (opcoes.titulo || 'ENCOMENDA CAMISOLAS - {data}')
    .replace('{data}', formatarData(encomenda.data))
    .replace('{titulo}', encomenda.titulo || '');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Encomendas';
  wb.created = new Date();
  const ws = wb.addWorksheet('Encomenda', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  for (const c of COLUNAS) ws.getColumn(c.de).width = c.largura;
  ws.getColumn(COL_FOTO).width = 20;

  let linha = 1;

  // Titulo
  ws.mergeCells(`${letra(1)}${linha}:${letra(COL_FOTO + 1)}${linha}`);
  const cTitulo = ws.getCell(linha, 1);
  cTitulo.value = tituloTexto;
  cTitulo.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } };
  cTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(linha).height = 30;
  linha += 2;

  const semFoto = [];

  for (const grupo of encomenda.grupos) {
    // Nome do cliente
    ws.mergeCells(`${letra(1)}${linha}:${letra(COL_FOTO + 1)}${linha}`);
    const cCliente = ws.getCell(linha, 1);
    cCliente.value = (grupo.cliente_nome || '').toUpperCase();
    cCliente.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cCliente.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CLIENTE } };
    cCliente.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(linha).height = 22;
    linha += 1;

    // Cabecalho
    for (const c of COLUNAS) {
      ws.mergeCells(`${letra(c.de)}${linha}:${letra(c.ate)}${linha}`);
      const cel = ws.getCell(linha, c.de);
      cel.value = c.titulo;
      cel.font = { bold: true, size: 10 };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
      cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cel.border = { top: BORDA, left: BORDA, bottom: BORDA, right: BORDA };
    }
    ws.getRow(linha).height = 20;
    linha += 1;

    for (const l of grupo.linhas) {
      const primeira = linha;
      const ultima = linha + LINHAS_POR_ITEM - 1;

      const valores = {
        item: l.camisola_nome || '',
        tamanho: l.tamanho || '-',
        // O ficheiro original tinha "SIM", "-" e um "Nao" solto; aqui e sempre um dos dois.
        personalizacao: l.personalizacao ? 'SIM' : '-',
        nome_numero: l.personalizacao_texto || '-'
      };

      for (const c of COLUNAS) {
        ws.mergeCells(`${letra(c.de)}${primeira}:${letra(c.ate)}${ultima}`);
        const cel = ws.getCell(primeira, c.de);
        cel.value = valores[c.chave];
        cel.alignment = {
          vertical: 'middle',
          horizontal: c.chave === 'item' ? 'left' : 'center',
          wrapText: true,
          indent: c.chave === 'item' ? 1 : 0
        };
        cel.font = { size: 10, bold: c.chave === 'item' };
        cel.border = { top: BORDA, left: BORDA, bottom: BORDA, right: BORDA };
      }

      for (let r = primeira; r <= ultima; r += 1) ws.getRow(r).height = alturaLinha;

      const caminhoFoto = l.camisola_foto ? fotos.caminhoDe(l.camisola_foto) : null;
      if (caminhoFoto) {
        const dim = await fotos.dimensoes(l.camisola_foto);
        const escala = dim && dim.altura ? alturaFoto / dim.altura : 1;
        const largura = dim ? Math.round(dim.largura * escala) : alturaFoto;
        const id = wb.addImage({ filename: caminhoFoto, extension: 'jpeg' });
        ws.addImage(id, {
          tl: { col: COL_FOTO - 1, row: primeira - 1, colOff: 20000, rowOff: 20000 },
          ext: { width: largura, height: alturaFoto },
          editAs: 'oneCell'
        });
      } else {
        semFoto.push(`${grupo.cliente_nome}: ${valores.item}`);
      }

      linha = ultima + 1;
    }

    linha += 1; // espaco entre clientes
  }

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await wb.xlsx.writeFile(destino);

  const stat = fs.statSync(destino);
  return {
    caminho: destino,
    bytes: stat.size,
    clientes: encomenda.grupos.length,
    camisolas: encomenda.totais.nCamisolas,
    semFoto
  };
}

function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * O nome traz sempre "_fornecedor". Sem isso a sugestao batia certo com o nome
 * do Excel de origem, e uma exportacao gravada por cima apagava os precos do
 * ficheiro antigo - aconteceu uma vez, a 21/09/2026.
 */
function nomeSugerido(encomenda) {
  const [a, m, d] = String(encomenda.data || '').split('-');
  return `${nomeFicheiro(`ENCOMENDA_${d}_${m}_${a}_fornecedor`)}.xlsx`;
}

module.exports = { exportar, nomeSugerido, formatarData, LINHAS_POR_ITEM, COLUNAS };
