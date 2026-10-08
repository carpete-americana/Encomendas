'use strict';

/** Entregar, juntar camisolas repetidas, e as copias de seguranca. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../src/main/db');
const camisolas = require('../src/main/db/repos/camisolas');
const clientes = require('../src/main/db/repos/clientes');
const encomendas = require('../src/main/db/repos/encomendas');
const copias = require('../src/main/servicos/copias');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'encomendas-entregas-'));
db.abrir(pasta);

test.after(() => {
  db.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

function encomendaCom(n, nomeCliente = 'Cliente') {
  const e = encomendas.criar({ data: '2026-09-22' });
  const cliente = clientes.criarOuObter({ nome: `${nomeCliente} ${e.id}` });
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    ids.push(encomendas.adicionarLinha(e.id, {
      cliente_id: cliente.id, camisola_nome: `Kit ${e.id}-${i}`, preco_fornecedor: 1000
    }));
  }
  return { e, cliente, ids };
}

// ----------------------------------------------------------------- entregas

test('entregar e outra coisa que chegar', () => {
  const { e, ids } = encomendaCom(2);
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'chegou' });

  let t = encomendas.porId(e.id).totais;
  assert.equal(t.chegaram, 1);
  assert.equal(t.entregues, 0);
  assert.equal(t.prontasParaEntregar, 1, 'chegou mas ainda nao foi para o dono');

  encomendas.atualizarLinha(ids[0], { entregue: true });
  t = encomendas.porId(e.id).totais;
  assert.equal(t.chegaram, 1, 'continua chegada depois de entregue');
  assert.equal(t.entregues, 1);
  assert.equal(t.prontasParaEntregar, 0);
  assert.equal(t.porEntregar, 1, 'falta a outra, que ainda nem chegou');
});

test('"tudo chegou" so mexe no que esta por chegar', () => {
  const { e, cliente, ids } = encomendaCom(4);
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });
  encomendas.atualizarLinha(ids[1], { estado_chegada: 'errada' });
  encomendas.atualizarLinha(ids[2], { estado_chegada: 'chegou', entregue: true });

  const mexidas = encomendas.marcarBloco(e.id, cliente.id, { estado_chegada: 'chegou', apenas: ['pendente'] });
  assert.equal(mexidas, 1, 'so a que estava pendente');

  const linhas = encomendas.linhasDe(e.id);
  assert.equal(linhas.find((l) => l.id === ids[0]).estado_chegada, 'em_falta', 'em falta nao foi desfeito');
  assert.equal(linhas.find((l) => l.id === ids[1]).estado_chegada, 'errada', 'errada nao foi desfeita');
  assert.equal(linhas.find((l) => l.id === ids[2]).entregue, true, 'a entregue continua entregue');
  assert.equal(linhas.find((l) => l.id === ids[3]).estado_chegada, 'chegou');
});

test('"entreguei tudo" so entrega o que ja ca esta', () => {
  const { e, cliente, ids } = encomendaCom(3);
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'chegou' });
  encomendas.atualizarLinha(ids[1], { estado_chegada: 'em_falta' });

  const n = encomendas.marcarBloco(e.id, cliente.id, { entregue: true, apenas: ['chegou'] });
  assert.equal(n, 1);

  const linhas = encomendas.linhasDe(e.id);
  assert.equal(linhas.find((l) => l.id === ids[0]).entregue, true);
  assert.equal(linhas.find((l) => l.id === ids[1]).entregue, false, 'o que esta em falta nao se entrega');
  assert.equal(linhas.find((l) => l.id === ids[2]).entregue, false, 'o que nao chegou tambem nao');
});

test('o cliente sabe quantas camisolas ainda tem para receber', () => {
  const { e, cliente, ids } = encomendaCom(3, 'Espera');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'chegou' });
  encomendas.atualizarLinha(ids[1], { estado_chegada: 'chegou', entregue: true });

  const c = clientes.porId(cliente.id);
  assert.equal(c.por_entregar, 2, 'uma ca a espera e outra que nem chegou');
  assert.equal(c.prontas_para_entregar, 1, 'so uma esta pronta a sair');
  assert.equal(encomendas.porId(e.id).totais.entregues, 1);
});

// ------------------------------------------------------------------ juntar

test('juntar camisolas repetidas nao perde linha nenhuma', () => {
  const { e, cliente } = encomendaCom(0, 'Junta');
  const a = camisolas.criarOuObter({ nome: 'Portugal 2026 alternativa', preco_fornecedor: 1000 });
  const b = camisolas.criarOuObter({ nome: 'portugal alternativa 2026', foto: 'f.jpg' });

  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_id: a.id });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_id: b.id });
  encomendas.adicionarLinha(e.id, { cliente_id: cliente.id, camisola_id: b.id });

  const r = camisolas.fundir(a.id, [b.id]);

  assert.equal(r.linhasMovidas, 2);
  assert.equal(encomendas.porId(e.id).totais.nCamisolas, 3, 'as tres linhas continuam la');
  assert.equal(camisolas.porId(b.id), null, 'a repetida saiu do catalogo');
  assert.equal(camisolas.porId(a.id).vezes_encomendada, 3);
  assert.equal(camisolas.porId(a.id).foto, 'f.jpg', 'herdou a foto que lhe faltava');
  assert.equal(camisolas.porId(a.id).preco_fornecedor, 1000, 'o preco que ja tinha ficou');
});

test('juntar recusa uma camisola consigo propria', () => {
  const a = camisolas.criarOuObter({ nome: 'Kit sozinho' });
  assert.throws(() => camisolas.fundir(a.id, [a.id]), /pelo menos uma/);
  assert.throws(() => camisolas.fundir(a.id, []), /pelo menos uma/);
});

// ------------------------------------------------------------------ copias

test('uma copia guarda a base tal como esta', () => {
  const antes = encomendas.listar().length;
  const c = copias.criar('teste');

  assert.ok(fs.existsSync(c.caminho));
  assert.ok(c.bytes > 1000, 'nao e um ficheiro vazio');
  assert.ok(copias.listar().some((x) => x.caminho === c.caminho));
  assert.equal(encomendas.listar().length, antes, 'a copia nao mexeu em nada');
});

test('restaurar volta atras e guarda o estado de agora', () => {
  const copia = copias.criar('antes-do-teste');
  const antes = encomendas.listar().length;

  const { e } = encomendaCom(2, 'Efemera');
  assert.equal(encomendas.listar().length, antes + 1);

  const r = copias.restaurar(copia.caminho);

  assert.equal(encomendas.listar().length, antes, 'voltou ao que era');
  assert.equal(encomendas.porId(e.id), null, 'a encomenda criada depois da copia desapareceu');
  assert.ok(fs.existsSync(r.guardadaAntes.caminho), 'o estado de agora ficou guardado');

  // E da para voltar ao estado mais recente, porque ele tambem ficou guardado.
  copias.restaurar(r.guardadaAntes.caminho);
  assert.ok(encomendas.porId(e.id), 'a encomenda voltou');
});

test('a poda so apaga copias, e nunca as mais recentes', () => {
  const quantas = copias.listar().length;
  copias.podar();
  const depois = copias.listar();
  assert.ok(depois.length <= copias.MAX_COPIAS);
  assert.ok(depois.length >= Math.min(quantas, 1));
  assert.ok(fs.existsSync(db.caminhos().base), 'a base nunca e tocada pela poda');
});

// ------------------------------------------------------- camisolas a devolver

test('uma camisola em falta vai de volta: sai do dinheiro todo', () => {
  const { e, ids } = encomendaCom(3, 'Devolve');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });

  const t = encomendas.porId(e.id).totais;
  assert.equal(t.nCamisolas, 3, 'a linha continua na encomenda');
  assert.equal(t.paraDevolver, 1);
  assert.equal(t.totalFornecedor, 2000, 'so as duas que ficam');
  assert.equal(t.totalCliente, 2800);
  assert.equal(t.lucro, 800);
  assert.equal(t.devolverAoFornecedor, 1000, 'o que ha a recuperar do fornecedor');
});

test('nao se cobra ao cliente uma camisola que vai de volta', () => {
  const { e, ids } = encomendaCom(2, 'Devolve');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });

  const t = encomendas.porId(e.id).totais;
  assert.equal(t.porReceber, 1400, 'so a que fica esta por pagar');
  assert.equal(t.naoCobradoAoCliente, 1400, 'e a outra deixou de ser cobrada');
});

test('o que ja tinha sido pago por uma camisola a devolver fica assinalado', () => {
  const { e, ids } = encomendaCom(2, 'Devolve');
  encomendas.atualizarLinha(ids[0], { pago: true });
  assert.equal(encomendas.porId(e.id).totais.aReembolsar, 0);

  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });
  const t = encomendas.porId(e.id).totais;
  assert.equal(t.aReembolsar, 1400, 'dinheiro do cliente que tem de voltar para tras');
  assert.equal(t.recebido, 0, 'e que ja nao conta como recebido');
});

test('uma camisola a devolver nao esta a espera de ser entregue', () => {
  const { e, ids } = encomendaCom(2, 'Devolve');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });

  const t = encomendas.porId(e.id).totais;
  assert.equal(t.porEntregar, 1, 'so a outra');
  assert.equal(t.prontasParaEntregar, 0);
});

test('as contas do cliente tambem deixam de contar o que vai de volta', () => {
  const { cliente, ids } = encomendaCom(2, 'DevolveCliente');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });

  const c = clientes.porId(cliente.id);
  assert.equal(c.total_camisolas, 2, 'as duas linhas continuam a ser dele');
  assert.equal(c.total_gasto, 1400, 'mas so gastou o da que fica');
  assert.equal(c.por_receber, 1400);
  assert.equal(c.por_devolver, 1);
  assert.equal(c.por_entregar, 1);
});

test('marcar que ja devolvi nao mexe no dinheiro, so no que falta fazer', () => {
  const { e, ids } = encomendaCom(2, 'JaDevolvi');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });

  let t = encomendas.porId(e.id).totais;
  assert.equal(t.paraDevolver, 1);
  assert.equal(t.porDevolver, 1, 'ainda ca esta');
  assert.equal(t.devolvidas, 0);

  encomendas.atualizarLinha(ids[0], { devolvida: true });
  t = encomendas.porId(e.id).totais;
  assert.equal(t.paraDevolver, 1, 'continua a ser uma camisola devolvida');
  assert.equal(t.porDevolver, 0, 'mas ja nao esta a espera');
  assert.equal(t.devolvidas, 1);
  assert.equal(t.totalFornecedor, 1000, 'o dinheiro continua de fora, devolvida ou nao');
  assert.equal(t.lucro, 400);
});

test('o cliente deixa de aparecer com devolucoes pendentes', () => {
  const { cliente, ids } = encomendaCom(2, 'PendenteDevolucao');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });
  assert.equal(clientes.porId(cliente.id).por_devolver, 1);

  encomendas.atualizarLinha(ids[0], { devolvida: true });
  assert.equal(clientes.porId(cliente.id).por_devolver, 0);
});

test('devolver um bloco de uma vez so toca no que esta para devolver', () => {
  const { e, cliente, ids } = encomendaCom(3, 'BlocoDevolucao');
  encomendas.atualizarLinha(ids[0], { estado_chegada: 'em_falta' });
  encomendas.atualizarLinha(ids[1], { estado_chegada: 'chegou' });

  const n = encomendas.marcarBloco(e.id, cliente.id, { devolvida: true, apenas: ['em_falta'] });
  assert.equal(n, 1);

  const linhas = encomendas.linhasDe(e.id);
  assert.equal(linhas.find((l) => l.id === ids[0]).devolvida, true);
  assert.equal(linhas.find((l) => l.id === ids[1]).devolvida, false, 'esta chegou, nao ha nada a devolver');
});
