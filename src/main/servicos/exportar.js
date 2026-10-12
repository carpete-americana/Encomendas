'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const fotos = require('./fotos');
const { nomeFicheiro } = require('./texto');

/**
 * Gera o Excel da encomenda. O que leva escolhe-se a cada exportacao (ver
 * CAMPOS): por omissao e a lista de producao para o fornecedor, sem precos.
 * Os precos so entram se forem pedidos, e nesse caso como numeros a serio,
 * com totais, para a folha servir tambem para fazer contas.
 *
 * Uma linha por camisola, com a foto dentro da propria linha: assim a folha
 * pode ser ordenada e filtrada no Excel sem se desfazer.
 */

/** O que se pode escolher, pela ordem em que aparece na folha. */
const CAMPOS = [
  { chave: 'foto', rotulo: 'Foto', omissao: true },
  { chave: 'tamanho', rotulo: 'Tamanho', omissao: true },
  { chave: 'personalizacao', rotulo: 'Personalização (sim/não)', omissao: true },
  { chave: 'nome_numero', rotulo: 'Nome · número · símbolo', omissao: true },
  { chave: 'preco_fornecedor', rotulo: 'Preço do fornecedor', omissao: false, preco: true },
  { chave: 'preco_cliente', rotulo: 'Preço ao cliente', omissao: false, preco: true },
  { chave: 'chegada', rotulo: 'Estado da chegada', omissao: false },
  { chave: 'pago', rotulo: 'Pago', omissao: false }
];

/**
 * Como os clientes aparecem: em blocos (um titulo por cliente), numa coluna
 * ao lado da camisola, ou nada (a lista so, sem nomes).
 */
const MODOS_CLIENTE = ['blocos', 'coluna', 'nenhum'];

const OMISSAO = {
  clientes: 'blocos',
  campos: CAMPOS.filter((c) => c.omissao).map((c) => c.chave)
};

const ESTADOS = { pendente: 'Por chegar', chegou: 'Chegou', errada: 'Errada', em_falta: 'Para devolver' };

const COR = {
  tinta: 'FF1F2937',
  tinta2: 'FF6B7280',
  titulo: 'FF0F172A',
  cabecalho: 'FF1E293B',
  cliente: 'FFEEF2FF',
  clienteTinta: 'FF3730A3',
  zebra: 'FFF8FAFC',
  linha: 'FFE2E8F0',
  total: 'FFF1F5F9'
};
const FINA = { style: 'thin', color: { argb: COR.linha } };
const FONTE = 'Calibri';

/** As colunas da folha, conforme o que foi escolhido. */
function colunasPara({ campos, clientes }) {
  const quer = (k) => campos.includes(k);
  const cols = [{ chave: 'n', titulo: 'Nº', largura: 5, alinhar: 'center' }];
  if (quer('foto')) cols.push({ chave: 'foto', titulo: 'FOTO', largura: 16, alinhar: 'center' });
  cols.push({ chave: 'item', titulo: 'ITEM', largura: 40, alinhar: 'left' });
  if (clientes === 'coluna') cols.push({ chave: 'cliente', titulo: 'CLIENTE', largura: 22, alinhar: 'left' });
  if (quer('tamanho')) cols.push({ chave: 'tamanho', titulo: 'TAMANHO', largura: 11, alinhar: 'center' });
  if (quer('personalizacao')) cols.push({ chave: 'personalizacao', titulo: 'PERSONALIZAÇÃO', largura: 16, alinhar: 'center' });
  if (quer('nome_numero')) cols.push({ chave: 'nome_numero', titulo: 'NOME - NÚMERO - SÍMBOLO', largura: 28, alinhar: 'center' });
  if (quer('preco_fornecedor')) cols.push({ chave: 'preco_fornecedor', titulo: 'PREÇO FORNECEDOR', largura: 18, alinhar: 'right', dinheiro: true });
  if (quer('preco_cliente')) cols.push({ chave: 'preco_cliente', titulo: 'PREÇO CLIENTE', largura: 16, alinhar: 'right', dinheiro: true });
  if (quer('chegada')) cols.push({ chave: 'chegada', titulo: 'CHEGADA', largura: 15, alinhar: 'center' });
  if (quer('pago')) cols.push({ chave: 'pago', titulo: 'PAGO', largura: 9, alinhar: 'center' });
  return cols;
}

/** Junta o que vem do ecra com o que falta, e deita fora o que nao existe. */
function normalizarEscolha(escolha = {}) {
  let clientes = MODOS_CLIENTE.includes(escolha.clientes) ? escolha.clientes : OMISSAO.clientes;
  // Compatibilidade com o "sem os nomes dos clientes" de antes.
  if (escolha.semClientes) clientes = 'nenhum';
  const validos = new Set(CAMPOS.map((c) => c.chave));
  const campos = Array.isArray(escolha.campos) ? escolha.campos.filter((c) => validos.has(c)) : OMISSAO.campos;
  return { clientes, campos };
}

function valorDe(chave, l, n) {
  switch (chave) {
    case 'n': return n;
    case 'item': return l.camisola_nome || '';
    case 'cliente': return l.cliente_nome || '';
    case 'tamanho': return l.tamanho || '-';
    // O ficheiro original tinha "SIM", "-" e um "Nao" solto; aqui e sempre um dos dois.
    case 'personalizacao': return l.personalizacao ? 'SIM' : '-';
    case 'nome_numero': return l.personalizacao_texto || '-';
    case 'preco_fornecedor': return (l.preco_fornecedor || 0) / 100;
    case 'preco_cliente': return (l.preco_cliente || 0) / 100;
    case 'chegada': return ESTADOS[l.estado_chegada] || l.estado_chegada || '';
    case 'pago': return l.pago ? 'Sim' : 'Não';
    default: return null;
  }
}

async function exportar(encomenda, destino, opcoes = {}) {
  const escolha = normalizarEscolha(opcoes);
  const alturaFoto = Number(opcoes.alturaFoto) || 108;
  const moeda = opcoes.moeda || '€';
  const formatoDinheiro = `#,##0.00 "${moeda.replace(/"/g, '')}"`;
  const tituloTexto = (opcoes.titulo || 'ENCOMENDA CAMISOLAS - {data}')
    .replace('{data}', formatarData(encomenda.data))
    .replace('{titulo}', encomenda.titulo || '');

  const cols = colunasPara(escolha);
  const ultimaCol = cols.length;
  const colDe = (chave) => cols.findIndex((c) => c.chave === chave) + 1;
  const temFoto = colDe('foto') > 0;
  const precos = cols.filter((c) => c.dinheiro);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Encomendas';
  wb.created = new Date();
  const ws = wb.addWorksheet('Encomenda', {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9,
      orientation: ultimaCol > 7 ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true
    },
    headerFooter: { oddFooter: '&L&8&K6B7280' + tituloTexto.replace(/&/g, '&&') + '&R&8&K6B7280Página &P de &N' }
  });

  // A coluna da foto fica com a largura da foto (as fotos sao ao alto, ~3:4).
  const larguraFotoPx = Math.round(alturaFoto * 0.78);
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.chave === 'foto' ? Math.max(10, larguraFotoPx / 7 + 2) : c.largura;
  });

  const linhasTodas = encomenda.grupos.flatMap((g) => g.linhas.map((l) => ({ ...l, cliente_nome: g.cliente_nome })));
  const nClientes = encomenda.grupos.length;

  // --- titulo -----------------------------------------------------------
  let r = 1;
  ws.mergeCells(r, 1, r, ultimaCol);
  const cTitulo = ws.getCell(r, 1);
  cTitulo.value = tituloTexto;
  cTitulo.font = { name: FONTE, bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.titulo } };
  cTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(r).height = 34;
  r += 1;

  ws.mergeCells(r, 1, r, ultimaCol);
  const cResumo = ws.getCell(r, 1);
  cResumo.value = [
    `${linhasTodas.length} ${linhasTodas.length === 1 ? 'camisola' : 'camisolas'}`,
    escolha.clientes !== 'nenhum' ? `${nClientes} ${nClientes === 1 ? 'cliente' : 'clientes'}` : null
  ].filter(Boolean).join('  ·  ');
  cResumo.font = { name: FONTE, size: 10, color: { argb: COR.tinta2 } };
  cResumo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(r).height = 20;
  r += 2;

  // --- cabecalho (um so, preso no topo e repetido em cada pagina) --------
  const linhaCabecalho = r;
  cols.forEach((c, i) => {
    const cel = ws.getCell(r, i + 1);
    cel.value = c.titulo;
    cel.font = { name: FONTE, bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.cabecalho } };
    cel.alignment = { vertical: 'middle', horizontal: c.alinhar === 'right' ? 'right' : 'center', wrapText: true };
    cel.border = { top: FINA, bottom: FINA, left: FINA, right: FINA };
  });
  ws.getRow(r).height = 26;
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${linhaCabecalho}:${linhaCabecalho}`;
  r += 1;

  const semFoto = [];
  const linhasDeItens = [];
  let n = 0;

  const blocos = escolha.clientes === 'blocos'
    ? encomenda.grupos.map((g) => ({ nome: g.cliente_nome, linhas: g.linhas.map((l) => ({ ...l, cliente_nome: g.cliente_nome })) }))
    : [{ nome: null, linhas: linhasTodas }];

  for (const bloco of blocos) {
    if (bloco.nome !== null) {
      ws.mergeCells(r, 1, r, ultimaCol);
      const c = ws.getCell(r, 1);
      const qt = bloco.linhas.length;
      c.value = {
        richText: [
          { text: (bloco.nome || '').toUpperCase(), font: { name: FONTE, bold: true, size: 11, color: { argb: COR.clienteTinta } } },
          { text: `   ${qt} ${qt === 1 ? 'camisola' : 'camisolas'}`, font: { name: FONTE, size: 9, color: { argb: COR.tinta2 } } }
        ]
      };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.cliente } };
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      c.border = { top: FINA, bottom: FINA };
      ws.getRow(r).height = 24;
      r += 1;
    }

    const inicio = r;
    for (const l of bloco.linhas) {
      n += 1;
      const zebra = n % 2 === 0;
      cols.forEach((c, i) => {
        const cel = ws.getCell(r, i + 1);
        const v = valorDe(c.chave, l, n);
        if (v !== null) cel.value = v;
        cel.font = {
          name: FONTE,
          size: c.chave === 'n' ? 9 : 11,
          bold: c.chave === 'item' || c.chave === 'tamanho',
          color: { argb: c.chave === 'n' ? COR.tinta2 : COR.tinta }
        };
        cel.alignment = { vertical: 'middle', horizontal: c.alinhar, wrapText: true, indent: c.alinhar === 'left' ? 1 : 0 };
        cel.border = { top: FINA, bottom: FINA, left: FINA, right: FINA };
        if (zebra) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.zebra } };
        if (c.dinheiro) cel.numFmt = formatoDinheiro;
      });
      // Uma camisola para devolver fica a vista, mas riscada.
      if (l.estado_chegada === 'em_falta') {
        cols.forEach((c, i) => { const cel = ws.getCell(r, i + 1); cel.font = { ...cel.font, strike: true, color: { argb: COR.tinta2 } }; });
      }

      ws.getRow(r).height = temFoto ? Math.round((alturaFoto + 12) * 0.75) : 22;

      if (temFoto) {
        const caminhoFoto = l.camisola_foto ? fotos.caminhoDe(l.camisola_foto) : null;
        if (caminhoFoto) {
          const dim = await fotos.dimensoes(l.camisola_foto);
          const escala = dim && dim.altura ? Math.min(alturaFoto / dim.altura, larguraFotoPx / dim.largura) : 1;
          const altura = dim ? Math.round(dim.altura * escala) : alturaFoto;
          const largura = dim ? Math.round(dim.largura * escala) : larguraFotoPx;
          const larguraColPx = ws.getColumn(colDe('foto')).width * 7;
          const id = wb.addImage({ filename: caminhoFoto, extension: 'jpeg' });
          ws.addImage(id, {
            // Centrada na celula; os desvios do ExcelJS vao em EMU (9525 por pixel).
            tl: {
              col: colDe('foto') - 1, row: r - 1,
              nativeColOff: Math.max(0, Math.round((larguraColPx - largura) / 2)) * 9525,
              nativeRowOff: Math.max(0, Math.round((alturaFoto + 12 - altura) / 2)) * 9525
            },
            ext: { width: largura, height: altura },
            editAs: 'oneCell'
          });
        } else {
          semFoto.push(`${l.cliente_nome}: ${l.camisola_nome}`);
          ws.getCell(r, colDe('foto')).value = 'sem foto';
          ws.getCell(r, colDe('foto')).font = { name: FONTE, size: 9, italic: true, color: { argb: COR.tinta2 } };
        }
      }
      linhasDeItens.push({ linha: r, conta: l.estado_chegada !== 'em_falta' });
      r += 1;
    }

    // Subtotal do cliente, so com precos e em blocos.
    if (bloco.nome !== null && precos.length && bloco.linhas.length) {
      linhaTotal(r, `Total ${bloco.nome}`, inicio, r - 1, false);
      r += 1;
    }
  }

  // Total geral: so conta as que nao sao para devolver.
  if (precos.length && linhasDeItens.length) {
    r += escolha.clientes === 'blocos' ? 1 : 0;
    linhaTotal(r, 'TOTAL', null, null, true);
    r += 1;
  }

  function linhaTotal(linha, texto, de, ate, geral) {
    const primeiraDinheiro = Math.min(...precos.map((c) => colDe(c.chave)));
    ws.mergeCells(linha, 1, linha, primeiraDinheiro - 1);
    const rotulo = ws.getCell(linha, 1);
    rotulo.value = texto;
    rotulo.font = { name: FONTE, bold: true, size: geral ? 12 : 10, color: { argb: COR.tinta } };
    rotulo.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    for (let c = 1; c <= ultimaCol; c += 1) {
      const cel = ws.getCell(linha, c);
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: geral ? 'FFE2E8F0' : COR.total } };
      cel.border = { top: { style: geral ? 'medium' : 'thin', color: { argb: 'FF94A3B8' } }, bottom: FINA };
    }
    for (const p of precos) {
      const col = colDe(p.chave);
      const L = ws.getColumn(col).letter;
      const contam = linhasDeItens
        .filter((x) => x.conta && (de === null || (x.linha >= de && x.linha <= ate)))
        .map((x) => x.linha);
      const cel = ws.getCell(linha, col);
      const soma = contam.reduce((s, x) => s + Number(ws.getCell(x, col).value || 0), 0);
      // Formula a serio, para continuar certa se mexerem na folha; o resultado
      // vai junto para aparecer logo, mesmo antes de o Excel recalcular.
      cel.value = contam.length
        ? { formula: contam.map((x) => `${L}${x}`).join('+'), result: Math.round(soma * 100) / 100 }
        : 0;
      cel.numFmt = formatoDinheiro;
      cel.font = { name: FONTE, bold: true, size: geral ? 12 : 10, color: { argb: COR.tinta } };
      cel.alignment = { vertical: 'middle', horizontal: 'right' };
    }
    ws.getRow(linha).height = geral ? 26 : 20;
  }

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await wb.xlsx.writeFile(destino);

  const stat = fs.statSync(destino);
  return {
    caminho: destino,
    bytes: stat.size,
    clientes: nClientes,
    camisolas: encomenda.totais.nCamisolas,
    escolha,
    semClientes: escolha.clientes === 'nenhum',
    comPrecos: precos.length > 0,
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

module.exports = { exportar, nomeSugerido, formatarData, normalizarEscolha, CAMPOS, MODOS_CLIENTE, OMISSAO };
