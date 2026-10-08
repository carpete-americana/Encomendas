import { esc, eur, fotoMini, iniciais, icone, nomeProprio } from '../util.js';

/**
 * Campo de procura com sugestoes. `procurar(texto)` devolve a lista, `desenhar`
 * pinta cada sugestao e `aoEscolher` recebe o item (ou `{ novo: texto }` quando
 * nao ha nada e se permite criar).
 */
export function autocompletar(input, { procurar, desenhar, aoEscolher, permitirNovo = false, textoNovo = 'Criar' }) {
  const caixa = document.createElement('div');
  caixa.className = 'sugestoes';
  caixa.style.display = 'none';
  input.parentElement.classList.add('relativo');
  input.parentElement.appendChild(caixa);

  let itens = [];
  let marcado = -1;
  let pedido = 0;

  function esconder() { caixa.style.display = 'none'; marcado = -1; }

  async function abrir() {
    const texto = input.value.trim();
    const meu = ++pedido;
    const resultados = await procurar(texto);
    if (meu !== pedido) return; // chegou uma resposta mais recente

    itens = resultados.slice(0, 40);
    const podeCriar = permitirNovo && texto.length >= 2
      && !itens.some((i) => (i.nome || '').toLowerCase() === texto.toLowerCase());

    if (!itens.length && !podeCriar) return esconder();

    caixa.innerHTML =
      itens.map((i, n) => `<div data-n="${n}">${desenhar(i)}</div>`).join('')
      + (podeCriar ? `<div data-novo class="nova">${icone('mais', 16)}${esc(textoNovo)}: “${esc(texto)}”</div>` : '');
    caixa.style.display = '';
    marcado = -1;
  }

  function escolher(el) {
    if (el.hasAttribute('data-novo')) aoEscolher({ novo: input.value.trim() });
    else aoEscolher(itens[Number(el.dataset.n)]);
    esconder();
  }

  input.addEventListener('input', abrir);
  input.addEventListener('focus', abrir);
  input.addEventListener('blur', () => setTimeout(esconder, 160));

  input.addEventListener('keydown', (e) => {
    const opcoes = [...caixa.children];
    if (caixa.style.display === 'none' || !opcoes.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      marcado = (marcado + (e.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % opcoes.length;
      opcoes.forEach((o, n) => o.classList.toggle('marcada', n === marcado));
      opcoes[marcado].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && marcado >= 0) {
      e.preventDefault();
      escolher(opcoes[marcado]);
    } else if (e.key === 'Escape') {
      esconder();
    }
  });

  caixa.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-n], [data-novo]');
    if (el) { e.preventDefault(); escolher(el); }
  });

  return { esconder, abrir };
}

/** Linha de sugestao de uma camisola: foto, nome e o que ela costuma custar. */
export function sugestaoCamisola(c, moeda = '€') {
  return `
    ${fotoMini(c.foto)}
    <div style="flex:1;min-width:0">
      <div style="font-weight:700">${esc(c.nome)}</div>
      <div class="pequeno dim" style="font-weight:600">
        ${c.vezes_encomendada ? `Pedida ${c.vezes_encomendada}×` : 'Nunca pedida'}
      </div>
    </div>
    ${c.preco_fornecedor !== null ? `<span class="dinheiro">${eur(c.preco_fornecedor, moeda)}</span>` : '<span class="pilula aviso">Sem preço</span>'}`;
}

/** Linha de sugestao de um cliente. */
export function sugestaoCliente(c) {
  return `
    <div class="avatar" style="width:30px;height:30px;font-size:13px">${esc(iniciais(c.nome))}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700">${esc(nomeProprio(c.nome))}</div>
      <div class="pequeno dim" style="font-weight:600">${c.total_camisolas || 0} camisolas em ${c.total_encomendas || 0} encomendas</div>
    </div>
    ${c.margem_override !== null && c.margem_override !== undefined
    ? `<span class="pilula acento sem-ponto">${c.margem_override === 0 ? 'Ao custo' : `+${eur(c.margem_override)}`}</span>` : ''}`;
}
