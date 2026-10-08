import { chamar, esc, eur, aviso, valorEuro, icone, caixa, ligar, confirmar, plural } from '../util.js';
import { estado, recarregar, aplicarTema, temaEscolhido } from '../app.js';

export async function desenhar(raiz) {
  const d = estado.definicoes;
  const info = estado.info;
  const moeda = d.moeda || '€';
  const tema = temaEscolhido();
  const copias = (await chamar('copias.listar')) || [];

  raiz.innerHTML = `
    <div class="cabeca">
      <div class="txt">
        <h1>Definições</h1>
        <div class="sub"><span>Valem para as camisolas novas. As que já estão numa encomenda guardam o preço com que entraram.</span></div>
      </div>
      <div class="acoes"><button class="btn primario" data-guardar>${icone('visto', 16)}Guardar alterações</button></div>
    </div>

    <div class="cartao" style="padding:28px 30px">
      <section class="def-secao">
        <div><h3>Preços</h3><p>Quanto ganhas por camisola e a quem compras. Um cliente pode ter a sua própria margem, e cada linha pode ser mudada à mão.</p></div>
        <div class="grelha-campos">
          <div class="campo"><label>Margem por camisola (${esc(moeda)})</label>
            <input name="margem_padrao" style="text-align:right" value="${valorEuro(d.margem_padrao)}">
            <div class="dica">Fornecedor 10,00 + margem ${eur(d.margem_padrao, moeda)} = ${eur(1000 + (d.margem_padrao || 0), moeda)} ao cliente.</div></div>
          <div class="campo"><label>Moeda</label><input name="moeda" value="${esc(moeda)}" maxlength="4" style="max-width:100px"></div>
          <div class="campo"><label>Fornecedor habitual</label><input name="fornecedor" value="${esc(d.fornecedor || '')}" placeholder="Opcional"></div>
        </div>
      </section>

      <section class="def-secao">
        <div><h3>Estampagem</h3><p>O que o fornecedor cobra a mais por estampar. Entra no preço de fornecedor da linha, e a margem vem por cima disso.</p></div>
        <div class="grelha-campos">
          <div class="campo"><label>Nome e número (${esc(moeda)})</label>
            <input name="estampagem_nome_numero" style="text-align:right" value="${valorEuro(d.estampagem_nome_numero)}">
            <div class="dica">"Ronaldo - 7"</div></div>
          <div class="campo"><label>Só nome ou só número (${esc(moeda)})</label>
            <input name="estampagem_so_um" style="text-align:right" value="${valorEuro(d.estampagem_so_um)}">
            <div class="dica">"Ronaldo" ou "7"</div></div>
          <div class="campo"><label>Exemplo</label>
            <div class="pequeno" style="font-weight:600;color:var(--tinta-2);line-height:1.6">
              Camisola ${eur(1000, moeda)} + estampagem ${eur(d.estampagem_nome_numero, moeda)}
              + margem ${eur(d.margem_padrao, moeda)} = <b>${eur(1000 + (d.estampagem_nome_numero || 0) + (d.margem_padrao || 0), moeda)}</b> ao cliente.
            </div></div>
        </div>
      </section>

      <section class="def-secao">
        <div><h3>Tamanhos</h3><p>Aparecem como sugestão ao escrever. O campo aceita qualquer coisa, porque há camisolas de criança numeradas.</p></div>
        <div class="campo"><label>Sugestões, separadas por vírgulas</label>
          <input name="tamanhos" value="${esc(d.tamanhos || '')}">
          <div class="linha-flex" style="gap:6px;flex-wrap:wrap;margin-top:6px">
            ${estado.tamanhos.map((t) => `<span class="tam">${esc(t)}</span>`).join('')}
          </div></div>
      </section>

      <section class="def-secao">
        <div><h3>Excel para o fornecedor</h3><p>Como sai a folha que envias. Leva camisola, tamanho, personalização, nome/número e foto — nunca preços.</p></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="campo"><label>Título da primeira linha</label>
            <input name="titulo_exportacao" value="${esc(d.titulo_exportacao || '')}">
            <div class="dica"><code>{data}</code> passa a data da encomenda, <code>{titulo}</code> o título dela.</div></div>
          <div class="campo"><label>Pasta onde os ficheiros ficam</label>
            <div class="linha-flex">
              <input name="pasta_exportacao" value="${esc(d.pasta_exportacao || '')}" placeholder="Ambiente de trabalho" readonly>
              <button class="btn" data-pasta>${icone('pasta', 16)}Escolher</button>
              <button class="btn fantasma" data-limpar-pasta>Repor</button>
            </div></div>
          <div class="grelha-campos" style="grid-template-columns:repeat(3,minmax(0,1fr))">
            <div class="campo"><label>Altura de cada linha</label><input name="export_altura_linha" type="number" min="10" max="60" value="${d.export_altura_linha}"></div>
            <div class="campo"><label>Altura da foto (px)</label><input name="export_foto_altura" type="number" min="40" max="300" value="${d.export_foto_altura}"></div>
            <div class="campo"><label>Tamanho das fotos novas (px)</label><input name="foto_max_px" type="number" min="150" max="1200" value="${d.foto_max_px}"></div>
          </div>
        </div>
      </section>

      <section class="def-secao">
        <div><h3>Aparência</h3><p>O modo automático segue o Windows. Também se troca pelo botão no fundo da barra lateral.</p></div>
        <div class="segmentos" style="justify-self:start;align-self:start">
          ${[['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro'], ['sistema', 'definicoes', 'Automático']]
    .map(([k, ic, t]) => `<button data-tema="${k}" class="${tema === k ? 'ativo' : ''}">${icone(ic, 15)}${t}</button>`).join('')}
        </div>
      </section>

      <section class="def-secao">
        <div><h3>Os teus dados</h3><p>Ficam só neste computador, fora da pasta da aplicação. Instalar uma versão nova nunca lhes toca, e desinstalar também não.</p></div>
        <div>
          <div class="lista-chaves">
            <div><span>Versão</span><b>${esc(info.versao || '?')}</b></div>
            <div><span>Base de dados</span><b class="pequeno">${esc(info.base || '')}</b></div>
            <div><span>Pasta</span><b class="pequeno">${esc(info.pastaDados || '')}</b></div>
          </div>
          <div class="linha-flex" style="margin-top:14px;flex-wrap:wrap">
            <button class="btn" data-abrir-pasta>${icone('pasta', 16)}Abrir a pasta</button>
            <button class="btn" data-importar>${icone('importar', 16)}Importar Excel antigo</button>
          </div>
        </div>
      </section>

      <section class="def-secao">
        <div><h3>Cópias de segurança</h3>
          <p>Uma cópia automática de 6 em 6 horas ao abrir a aplicação, e outra antes de importar, apagar uma encomenda ou juntar camisolas. Ficam as ${copias.length ? '' : ''}últimas 40.</p></div>
        <div>
          <div class="linha-flex" style="flex-wrap:wrap;margin-bottom:14px">
            <button class="btn primario" data-copia-agora>${icone('arquivo', 16)}Fazer cópia agora</button>
            <button class="btn" data-copia-exportar title="Copia a base e as fotos para onde quiseres">${icone('exportar', 16)}Guardar noutro sítio</button>
            <button class="btn fantasma" data-copia-pasta>${icone('pasta', 16)}Abrir pasta das cópias</button>
          </div>
          <div class="cartao sem-pad" style="box-shadow:none;max-height:260px;overflow-y:auto">
            ${copias.length ? `<div class="lista-simples">
              ${copias.slice(0, 20).map((c) => `
                <div>
                  <div style="min-width:0">
                    <div class="t">${esc(quando(c.quando))}</div>
                    <div class="s">${esc(motivoTexto(c.motivo))} · ${(c.bytes / 1024).toFixed(0)} KB</div>
                  </div>
                  <div class="dir"><button class="btn pequeno" data-restaurar="${esc(c.caminho)}">Restaurar</button></div>
                </div>`).join('')}
            </div>` : '<div style="padding:18px" class="pequeno dim">Ainda não há cópias. A primeira é feita no próximo arranque.</div>'}
          </div>
        </div>
      </section>
    </div>

    <div style="margin-top:18px">${caixa('As alterações só ficam depois de carregar em <b>Guardar alterações</b>. O tema muda na hora.', 'info')}</div>`;

  raiz.querySelector('[data-pasta]').addEventListener('click', async () => {
    const p = await chamar('definicoes.escolherPasta');
    if (p) { raiz.querySelector('[name="pasta_exportacao"]').value = p; aviso(p, 'ok', 'Pasta escolhida'); }
  });
  raiz.querySelector('[data-limpar-pasta]').addEventListener('click', () => {
    raiz.querySelector('[name="pasta_exportacao"]').value = '';
  });
  raiz.querySelector('[data-abrir-pasta]').addEventListener('click', () => chamar('app.abrirPastaDados'));
  raiz.querySelector('[data-importar]').addEventListener('click', async () => {
    const { abrirImportador } = await import('./importar.js');
    abrirImportador();
  });

  raiz.querySelector('[data-copia-agora]').addEventListener('click', async () => {
    const c = await chamar('copias.criar');
    aviso(`${(c.bytes / 1024).toFixed(0)} KB guardados na pasta das cópias.`, 'ok', 'Cópia feita');
    desenhar(raiz);
  });

  raiz.querySelector('[data-copia-pasta]').addEventListener('click', () => chamar('copias.abrirPasta'));

  raiz.querySelector('[data-copia-exportar]').addEventListener('click', async () => {
    const r = await chamar('copias.exportar');
    if (r) aviso(`Base e ${plural(r.fotos, 'foto', 'fotos')} em ${r.pasta}`, 'ok', 'Cópia guardada');
  });

  ligar(raiz, 'click', '[data-restaurar]', async (e, el) => {
    const ok = await confirmar('Voltar a esta cópia?',
      'A base de agora é substituída pela da cópia. Antes disso é guardada uma cópia do estado atual, por isso dá sempre para voltar atrás.',
      { confirmar: 'Restaurar', perigo: false });
    if (!ok) return;
    const r = await chamar('copias.restaurar', el.dataset.restaurar);
    aviso(`O estado de antes ficou guardado em ${r.guardadaAntes.nome}.`, 'ok', 'Cópia restaurada');
    await recarregar();
  });

  ligar(raiz, 'click', '[data-tema]', (e, el) => {
    aplicarTema(el.dataset.tema);
    raiz.querySelectorAll('[data-tema]').forEach((b) => b.classList.toggle('ativo', b === el));
  });

  raiz.querySelector('[data-guardar]').addEventListener('click', async () => {
    const v = (n) => raiz.querySelector(`[name="${n}"]`).value.trim();
    await chamar('definicoes.gravar', {
      // Vai em euros: a definicao e do tipo `dinheiro` e o repositorio converte.
      margem_padrao: v('margem_padrao') || '0',
      estampagem_nome_numero: v('estampagem_nome_numero') || '0',
      estampagem_so_um: v('estampagem_so_um') || '0',
      moeda: v('moeda') || '€',
      fornecedor: v('fornecedor'),
      tamanhos: v('tamanhos'),
      titulo_exportacao: v('titulo_exportacao'),
      export_altura_linha: Number(v('export_altura_linha')) || 22,
      export_foto_altura: Number(v('export_foto_altura')) || 108,
      foto_max_px: Number(v('foto_max_px')) || 420,
      pasta_exportacao: v('pasta_exportacao')
    });
    aviso('Valem a partir das próximas camisolas.', 'ok', 'Definições guardadas');
    await recarregar();
  });
}

function quando(ms) {
  const d = new Date(ms);
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} \u00e0s ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

const MOTIVOS = {
  manual: 'Feita por ti',
  arranque: 'Autom\u00e1tica',
  'antes-de-importar': 'Antes de importar um Excel',
  'antes-de-apagar-encomenda': 'Antes de apagar uma encomenda',
  'antes-de-juntar': 'Antes de juntar camisolas',
  'antes-de-restaurar': 'Antes de restaurar'
};

function motivoTexto(m) {
  return MOTIVOS[m] || m;
}
