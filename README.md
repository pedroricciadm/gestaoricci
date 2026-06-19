# Sistema de Gestão — Grupo RICCI

Sistema de gestão financeira **multiempresa** do Grupo RICCI: visão consolidada do grupo +
visão individual de cada frente, com **banco de dados**, **cadastros**, **lançamentos (CRUD)**,
**relatórios** e **consolidação automática**. Roda na **porta 3500**.

> Evoluiu do painel inicial (que só lia o Excel) para um sistema com banco SQLite e lançamentos
> próprios. Veja a arquitetura completa em [`DOCUMENTACAO.md`](DOCUMENTACAO.md).

## Como rodar
- Duplo-clique em **`INICIAR PAINEL.bat`** (abre o navegador), ou
- Terminal nesta pasta: `npm start`
- Acesse: **http://localhost:3500**

### Primeira instalação / repovoar dados
```
npm install
node seed.js          # cadastros básicos (empresas, contas, categorias, centros)
node import-excel.js  # carga única de conveniência: lê o Excel do OneDrive p/ o banco
npm start
```
O banco fica em `data/ricci.db` (SQLite). Apagar esse arquivo zera tudo (re-rode seed + import).

## Telas
- **Dashboard Geral** — consolidado do grupo (KPIs, mensal, por empresa, despesas, AGF 100/40, evolução anual)
- **Lançamentos** — listar/filtrar + **nova entrada / saída / transferência** (CRUD)
- **Relatórios** — DRE consolidado, resultado por empresa, evolução anual
- **Empresas** (menu lateral) — BRC, Mais Envios, Agência dos Correios, Grupo Ricci (Loja), Licenciados, Família, Investimentos
- **Cadastros** — empresas, unidades, contas, categorias, centros de custo

## Regras de consolidação
- **Agência dos Correios:** operação exibida a **100%** (gestão integral, lida do arquivo da AGF);
  resultado atribuível ao Grupo calculado a **40%**.
- **Família:** centro separado, **não entra** no resultado operacional (distribuição compulsória /
  antecipada — subsistência dos fundadores). Aparece como linha própria no DRE.
- **Mais Envios:** empresa-filha da BRC (compõe a BRC no consolidado).
- **Licenciados:** pontos de atendimento de licenciados — frente separada, a detalhar.

## Stack
Node.js + Express 5 · SQLite (better-sqlite3) · SheetJS (xlsx) · front SPA vanilla JS + Chart.js.
```
server.js          API REST + consolidação + leitura AGF (Excel)
db.js              schema do banco (SQLite)
seed.js            cadastros iniciais
import-excel.js    carga única do Excel -> banco
public/            SPA (index.html, app.js, style.css)
scripts/           inspetores das planilhas (inspect/dump)
data/ricci.db      banco (gerado)
```

## Pendências (próximas etapas)
1. Tela de **importação** de planilhas (upload + mapeamento de colunas + validação) — adiada de propósito.
2. **Caixa e bancos** com saldos e conciliação; **Contas a pagar/receber** dedicadas.
3. **Usuários, login e permissões** por empresa; acesso remoto.
4. Detalhar **Licenciados** (o que será inputado de cada ponto).
5. Rateio de overhead da BRC entre Mais Envios / Agência (hoje a BRC concentra as despesas gerais).
