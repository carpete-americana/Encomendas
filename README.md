# Encomendas

App de secretária (Electron, Windows) para gerir encomendas de camisolas.
Substitui o Excel como sítio onde se trabalha, e passa a **gerar** o Excel que vai
para o fornecedor.

**A regra que manda em tudo:** na app fica o dinheiro todo (preços, margens, lucro,
quem pagou); no Excel exportado vai só a lista de produção — item, tamanho,
personalização, nome/número e a foto. Nenhum preço chega ao fornecedor.

## Correr

```bash
npm install
npm start
```

`npm run dev` abre com as ferramentas de programador e manda a consola do
interface para o terminal.

## Onde ficam os dados, e porque não se perdem

`%APPDATA%\Encomendas` — a base (`encomendas.db`, SQLite), a pasta `fotos` e a
pasta `copias`. **Fica fora da pasta da aplicação de propósito:** instalar uma
versão nova, ou desinstalar, não lhe toca (`deleteAppDataOnUninstall: false`).

Cópias de segurança automáticas, em Definições → Cópias de segurança:

- uma de 6 em 6 horas, ao abrir a aplicação;
- uma antes de cada operação que mexe em muita coisa: importar um Excel, apagar
  uma encomenda, juntar camisolas, restaurar;
- ficam as últimas 40, e restaurar guarda primeiro o estado atual, por isso
  também dá para desfazer um restauro.

São feitas com `VACUUM INTO`, que escreve uma base inteira e consistente mesmo
com a aplicação a trabalhar. Nada apaga dados sem ser a pedido: a poda só mexe
em ficheiros de cópia.

Não há servidor, não há login, não sai nada da máquina.

## Importar o Excel antigo

Pelo menu **Ficheiro → Importar Excel** (Ctrl+I), ou pela linha de comandos:

```bash
node tools/importar-cli.js "C:/Users/andre/Desktop/ENCOMENDA_28_06_2026.xlsx" --ensaio
```

`--ensaio` mostra o que encontrou sem escrever nada. Sem a opção, importa.

O importador cria os clientes, mete as camisolas no catálogo (as repetidas entram
uma vez só) com as fotos extraídas do ficheiro, e recria a encomenda com os preços
que lá estavam. Na app, a janela mostra tudo o que vai entrar **antes** de escrever.

## Exportar

Botão **Exportar Excel** na página da encomenda, ou:

```bash
node tools/exportar-cli.js <id-da-encomenda>
```

## Fotos do catálogo

Na ficha da camisola: **Escolher foto** (um ficheiro), ou **Colar foto** para
usar a imagem que está copiada — no browser, botão direito → *Copiar imagem*.
Com a ficha aberta, Ctrl+V faz o mesmo. Copiar um ficheiro no explorador não
serve: isso copia o caminho, não a imagem.

## Imagem para o cliente

Na página da encomenda, cada cliente tem um botão **Imagem**. Gera uma imagem
com as camisolas dele (foto, tamanho, nome/número), o preço de cada uma e o
total a pagar, e copia-a para a área de transferência: é só colar (Ctrl+V) na
conversa para ele confirmar. Não abre janela nem grava ficheiro.

Leva **só o preço ao cliente**, nunca o do fornecedor. As camisolas "para
devolver" não aparecem, e se já pagou uma parte mostra o que falta.

## Testes

```bash
npm test
```

73 testes: dinheiro em cêntimos, cascata de margens, totais, agrupamento,
normalização de nomes, a imagem para os clientes, e um teste de aceitação que importa o Excel real de
28/06/2026 e o exporta de volta. Esse salta sozinho se o ficheiro não estiver
na secretária.

Dois testes que precisam do Electron e por isso correm à parte:

```bash
npx electron tools/smoke.js          # abre todos os ecrãs e conta erros
npx electron tools/smoke.js --fotos  # e guarda capturas em _ecras/
npx electron tools/fluxo.js          # conduz o interface: adicionar, editar, marcar, exportar
```

## Construir o instalador

```bash
npm run dist
```

Sai um instalador NSIS em `dist/`.

## Publicar uma versão nova

A app instalada procura sozinha uma versão nova (ao abrir e de 6 em 6 horas),
descarrega-a em segundo plano e instala-a ao fechar, ou já, pelo botão em
**Definições → Atualizações**. Vai buscá-la às Releases deste repositório no
GitHub, por isso **o repositório tem de ser público**.

**Cada merge para o `main` publica uma versão nova sozinho.** O GitHub Actions
(`.github/workflows/release.yml`) corre os testes numa máquina Windows, sobe o
último número da versão (1.1.0 → 1.1.1), grava-a no `main`, constrói o
instalador e publica-o como Release.

- Merges que só mexem em documentação (`.md`) não fazem versão nova.
- Para uma mudança maior, sobe a versão à mão antes do merge, e o workflow usa
  essa em vez de somar outra:
  ```bash
  npm version minor --no-git-tag-version   # 1.1.x -> 1.2.0
  ```
- O workflow faz um commit "Versao x.y.z" no `main`: faz `git pull` antes de
  voltares a trabalhar.
- Se os testes ou a build falharem, não sai versão nenhuma; o erro fica no
  separador *Actions*. Também dá para publicar à mão por lá ("Run workflow").

A primeira versão tem de ser instalada à mão (o instalador da Release); dessa
em diante atualiza-se sozinha. Sem assinatura de código, o Windows pode mostrar
o aviso do SmartScreen nessa primeira instalação.

## Decisões que não se devem desfazer sem pensar

- **Todo o dinheiro vive em cêntimos inteiros.** Em vírgula flutuante,
  150,67 − 115,72 dá 34,9499… e uma dívida fechada parece por fechar.
- **O preço da linha é copiado do catálogo, não lido por referência.** Mudar o
  preço de uma camisola hoje não pode reescrever o que uma encomenda de há três
  meses custou.
- **A margem desce em cascata:** linha → cliente → definição. Não é fixa: nos dados
  reais é +4 € quase sempre, mas há +3, +2 e 0 € (as minhas e as da Gabriel/Sara).
  Uma margem de cliente a 0 é uma escolha; vazia é "usa a por omissão".
- **Os totais são sempre calculados.** A caixa *Valores* do Excel original tinha
  829 € escritos à mão quando a soma real da coluna era 825 €, e ninguém deu por isso.
- **O tamanho é texto livre.** Há `26` e `28` de criança ao lado de S/M/L/XL/XXL.
- **A base não é `better-sqlite3`.** É SQLite em WebAssembly (`node-sqlite3-wasm`)
  porque esta máquina não tem as ferramentas de C++ do Visual Studio e o
  `better-sqlite3` não compila para Electron sem elas. É SQLite a sério na mesma.
- **As fotos são guardadas pelo resumo do conteúdo** e reduzidas a 420 px. O Excel
  original tinha 16 MB; as mesmas 55 fotos ocupam aqui 716 KB.
- **A estampagem é um extra do fornecedor**, somado por cima do preço da camisola:
  +3,00 € por nome e número, +2,00 € por só um deles (configurável em Definições).
  O catálogo guarda sempre a **camisola lisa**; a estampagem entra na linha.
  Ligar ou desligar a personalização numa linha ajusta os dois preços sozinha.
- **Os preços importados dos Excel antigos já incluíam a estampagem**, por isso o
  importador marca-os como finais (`precos_finais`) e não soma nada. O catálogo
  tem uma revisão (botão "Rever preços") para as camisolas que só foram pedidas
  personalizadas e cujo preço de catálogo ficou com o extra lá dentro.
- **"Em falta" quer dizer "para devolver".** A camisola volta para trás, por isso
  não é vendida: sai do que pagas ao fornecedor, do que cobras, do lucro e do que
  o cliente deve. A linha fica na encomenda, riscada, e os números mostram quantas
  são, quanto há a recuperar do fornecedor, e quanto já tinha sido pago pelos
  clientes e está para devolver.
- **Chegar e entregar são coisas diferentes.** `estado_chegada` diz se a camisola
  já cá está; `entregue` diz se já foi para o dono. Uma camisola pode estar cá
  há uma semana e ainda não ter sido entregue, e é isso que a coluna "Por
  entregar" dos clientes mostra.
- **"Tudo chegou" só mexe no que está por chegar**, e "Entreguei tudo" só no que
  já chegou. Um "em falta" marcado à mão não é desfeito por um clique em massa.
- **Juntar camisolas** (catálogo) resolve o mesmo artigo escrito de duas maneiras
  nos Excel antigos: as linhas passam todas para a que fica e nenhuma se perde.
- **O Excel exportado leva `_fornecedor` no nome.** Sem isso a sugestão batia
  certo com o nome do ficheiro de origem — a 21/09/2026 uma exportação foi
  gravada por cima do Excel original e apagou-lhe os preços.
- **O CSP fecha o `script-src`** e abre só o `style-src`, para os atributos `style=`
  das barras de progresso e das fotos.
