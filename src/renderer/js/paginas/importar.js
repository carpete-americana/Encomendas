import { chamar, esc, eur, data, modal, aviso, faixa, kpi, caixa, tamanho, estampa, icone, plural, nomeProprio } from '../util.js';
import { estado, recarregar } from '../app.js';

/**
 * Importa um Excel do formato antigo. Mostra sempre o que encontrou ANTES de
 * escrever: a leitura de um ficheiro feito a mao adivinha, e o que adivinhou
 * tem de estar a vista antes de entrar na base.
 */
let aDecorrer = false;

export async function abrirImportador() {
  if (aDecorrer) return; // duplo clique ou Ctrl+I com a janela ja aberta
  aDecorrer = true;
  try {
    await importador();
  } finally {
    aDecorrer = false;
  }
}

async function importador() {
  const caminho = await chamar('importar.escolherFicheiro');
  if (!caminho) return;

  let analise;
  try {
    analise = await chamar('importar.analisar', caminho);
  } catch {
    return;
  }

  const moeda = estado.definicoes.moeda || '€';
  const r = analise.resumo;

  const confirmado = await modal({
    titulo: 'Importar Excel',
    largo: true,
    confirmar: `Importar ${plural(r.camisolas, 'camisola', 'camisolas')}`,
    corpo: `
      <div class="lista-chaves">
        <div><span>Ficheiro</span><b class="pequeno">${esc(caminho)}</b></div>
        <div><span>Título</span><b>${esc(analise.titulo)}</b></div>
        <div><span>Data</span><b>${data(analise.data)}</b></div>
      </div>

      ${faixa(
    kpi('Clientes', r.clientes),
    kpi('Camisolas', r.camisolas),
    kpi('Com foto', `${r.comFoto}<small>/${r.camisolas}</small>`, r.semFoto ? `${r.semFoto} sem foto` : ''),
    kpi('Fornecedor', eur(r.totalFornecedor, moeda)),
    kpi('Lucro', eur(r.totalCliente - r.totalFornecedor, moeda), '', 'ok')
  )}

      ${analise.avisos.length ? caixa(analise.avisos.map(esc).join('<br>')) : ''}
      ${caixa('As camisolas repetidas entram <b>uma vez só</b> no catálogo. Os preços ficam como estão no ficheiro — é o que foi cobrado na altura, não o que a margem de hoje diria.', 'info')}

      <div>
        <h2 class="secao" style="margin-top:0">O que vai entrar</h2>
        <div class="cartao sem-pad" style="max-height:320px;overflow-y:auto;box-shadow:none">
          <table>
            <thead><tr>
              <th>Cliente</th><th>Camisola</th><th>Tam.</th><th>Estampagem</th><th class="meio">Foto</th>
              <th class="num">Fornec.</th><th class="num">Cliente</th>
            </tr></thead>
            <tbody>
              ${analise.clientes.flatMap((c) => c.itens.map((i, n) => `
                <tr>
                  <td style="font-weight:700">${n ? '' : esc(nomeProprio(c.nome))}</td>
                  <td class="pequeno" style="font-weight:600">${esc(i.nome)}</td>
                  <td>${tamanho(i.tamanho)}</td>
                  <td>${i.personalizacao ? estampa(i.personalizacaoTexto) : '<span class="dim">—</span>'}</td>
                  <td class="meio">${i.temFoto ? `<span style="color:var(--ok);display:inline-block">${icone('visto', 16)}</span>` : '<span class="dim">—</span>'}</td>
                  <td class="num"><span class="dinheiro">${eur(i.precoFornecedor, moeda)}</span></td>
                  <td class="num"><span class="dinheiro">${eur(i.precoCliente, moeda)}</span></td>
                </tr>`)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <label class="linha-flex pequeno" style="gap:9px;color:var(--tinta-2);font-weight:600;cursor:pointer">
        <input type="checkbox" name="substituir"> Substituir a encomenda com este título e data, se já tiver sido importada
      </label>`,

    aoConfirmar: (m) => ({ substituir: m.querySelector('[name="substituir"]').checked })
  });

  if (!confirmado) return;

  const feito = await chamar('importar.importar', caminho, confirmado);
  aviso(
    `${plural(feito.camisolas, 'camisola', 'camisolas')} de ${plural(feito.clientes, 'cliente', 'clientes')}; ` +
    `${feito.camisolasNovasNoCatalogo} novas no catálogo, ${feito.fotosGuardadas} fotos.`,
    'ok', 'Excel importado'
  );

  await recarregar();
  location.hash = `#/encomenda/${feito.encomenda_id}`;
}

// A pagina so existe como modal; entrar por #/importar leva a lista.
export async function desenhar() {
  location.hash = '#/encomendas';
}
