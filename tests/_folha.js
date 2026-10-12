'use strict';

/**
 * Le a folha exportada de volta: cabecalhos, clientes, camisolas e totais.
 * Serve aos testes para verificarem o que la esta sem dependerem de linhas e
 * colunas fixas.
 */
function texto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && 'result' in v) return String(v.result);
  return String(v);
}

function lerFolha(ws) {
  let linhaCab = null;
  ws.eachRow((row) => {
    if (linhaCab === null && row.values.some((v) => texto(v) === 'ITEM')) linhaCab = row.number;
  });
  if (linhaCab === null) throw new Error('A folha nao tem cabecalho.');

  const cabecalhos = [];
  for (let c = 1; c <= ws.columnCount; c += 1) {
    const t = texto(ws.getCell(linhaCab, c).value);
    if (t) cabecalhos.push(t);
  }

  const clientes = [];
  const itens = [];
  const totais = [];
  for (let r = linhaCab + 1; r <= ws.rowCount; r += 1) {
    const a = ws.getCell(r, 1);
    if (typeof a.value === 'number') {
      const item = { linha: r, cliente: clientes[clientes.length - 1] || null };
      cabecalhos.forEach((h, i) => { item[h] = ws.getCell(r, i + 1).value; });
      itens.push(item);
    } else if (a.value && a.value.richText) {
      clientes.push(a.value.richText[0].text.trim());
    } else if (/^total/i.test(texto(a.value))) {
      const t = { rotulo: texto(a.value) };
      cabecalhos.forEach((h, i) => { if (/^PREÇO/.test(h)) t[h] = ws.getCell(r, i + 1).value; });
      totais.push(t);
    }
  }
  return { cabecalhos, clientes, itens, totais };
}

module.exports = { lerFolha, texto };
