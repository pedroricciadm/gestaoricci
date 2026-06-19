# Documentação — Sistema de Gestão Grupo RICCI

> Atualizado em 19/06/2026. O projeto evoluiu de um **painel que lia o Excel** para um
> **sistema de gestão multiempresa** com banco de dados, lançamentos próprios (CRUD),
> cadastros, relatórios e consolidação automática. Roda na porta 3500.

---

## 1. Objetivo

Centralizar a gestão financeira do Grupo RICCI permitindo **controle individual de cada frente**
e a **visão consolidada do grupo**, com lançamento manual de entradas/saídas, classificação por
categoria/centro de custo/unidade e relatórios por empresa e consolidados — começando a abandonar
gradualmente o controle por planilhas.

Ordem de construção seguida (recomendação do usuário): **modelo de dados → navegação → CRUD de
lançamentos** primeiro; a automação de importação de planilhas fica para depois.

---

## 2. Estrutura empresarial (3 níveis)

**Nível 1 — Grupo:** Grupo RICCI (consolidado).
**Nível 2 — Empresas/frentes:**

| Frente | Tipo | Participação | Consolida? | Observação |
|---|---|---|---|---|
| **BRC** | empresa | 100% | sim | Transportadora / operação principal (220 Log). Concentra as despesas gerais. |
| **Mais Envios** | empresa (filha da BRC) | 100% | sim | PDV e Faturado. Compõe a BRC no consolidado. |
| **Agência dos Correios** | empresa | 40% | sim | Gestão 100% pelo grupo; resultado atribuível 40%. |
| **Grupo Ricci (Loja)** | empresa | 100% | sim | Conveniência / loja. |
| **Licenciados** | empresa | 100% | sim | Pontos de licenciados (Caiçara, Anchieta, Prudente, Jd. Canadá, Boa Esperança). A detalhar. |
| **Família** | centro | 100% | **não** | Distribuição compulsória/antecipada (subsistência dos fundadores). Fora do resultado operacional. |
| **Investimentos** | centro | 100% | sim | Rendimentos e aplicações. |

### Regra da Agência dos Correios (100% / 40%)
A operação aparece **integral (100%)** porque o grupo administra tudo (lido do arquivo próprio da
AGF: `Financeiro Geral - AGF 2026.xlsx`). O **resultado** atribuível ao grupo é calculado a **40%**
(`PCT_GRUPO_AGF` em `server.js`). O Dashboard e a página da Agência mostram as duas visões.

> Nota: nos lançamentos, a empresa "Agência dos Correios" guarda o que **entra no grupo**
> (Comissão, Distribuição, Taxas, Outros). A visão 100%/40% é analítica, sobre o P&L da agência.

### Regra da Família
É tratada como **distribuição de lucros intermediária e compulsória**, que antecede a apuração de
lucro. Por isso `consolida=0`: não entra no resultado operacional, mas aparece numa linha própria
("Distribuição familiar") e no "Resultado após família".

---

## 3. Modelo de dados (SQLite — `db.js`)

Tabelas: `empresas`, `unidades`, `contas_financeiras`, `categorias`, `centros_custo`, `pessoas`,
`lancamentos`, `anexos`, `usuarios`, `permissoes_usuario_empresa`, `evolucao_anual`.

**`lancamentos`** é o núcleo: empresa, unidade, conta, pessoa, categoria, centro de custo, tipo
(entrada/saída/transferência), descrição, datas (competência/vencimento/pagamento), valores
(bruto/desconto/taxa/líquido), status, recorrente, origem (manual/importacao), observações.

`empresas` tem `percentual_participacao`, `empresa_pai_id` (hierarquia: Mais Envios → BRA),
`consolida` (entra no resultado operacional?) e `cor` (gráficos).

`evolucao_anual` guarda os totais por ano (faturamento, custo, resultado, recebimentos,
pagamentos) para a visão de evolução histórica.

---

## 4. Dados carregados

`import-excel.js` faz uma **carga única de conveniência** (linha de comando) lendo a aba
"Financeiro Geral" de cada arquivo anual do OneDrive (2018–2026) e gravando:
- **Detalhe** por empresa/categoria/mês em `lancamentos` (origem='importacao');
- **Totais por ano** em `evolucao_anual`.

Classificação (rótulo → empresa/categoria) em `CLASSIFIER`. As 6 categorias de despesa somam o
"Custo Total" e as linhas de faturamento somam o "Faturamento Total" — sem duplicação. Subtotais
e linhas de fluxo de caixa são ignorados.

**Cobertura atual:** ~1.061 lançamentos. Anos ricos: 2023–2026. 2017 ficou de fora (estrutura
antiga divergente); 2018–2019 parciais.

**Reconciliação 2026 (validada):** Faturamento R$ 841.693 · Custo operacional (excl. Família)
R$ 833.567 · Resultado operacional R$ +8.126 · Distribuição familiar R$ 206.244 · Resultado após
família −R$ 198.118 (bate com o "Resultado Financeiro Geral" do mestre). AGF 100% R$ 513.950 →
Grupo 40% R$ 205.580.

---

## 5. API REST (`server.js`)

| Método/rota | Função |
|---|---|
| `GET /api/empresas` `/unidades` `/contas` `/categorias` `/centros-custo` `/pessoas` | cadastros |
| `POST /api/pessoas` | criar pessoa |
| `GET /api/lancamentos` | listar (filtros: empresa_id, ano, mes, tipo, categoria_id, status, origem, q) |
| `POST /api/lancamentos` | criar lançamento |
| `PUT /api/lancamentos/:id` | editar |
| `DELETE /api/lancamentos/:id` | excluir |
| `GET /api/dashboard?ano=` | consolidado (KPIs, mensal, por empresa/categoria, evolução, AGF) |
| `GET /api/empresa/:id/dashboard?ano=` | visão individual da empresa |
| `GET /api/health` | status (nº empresas e lançamentos) |

---

## 6. Front-end (SPA — `public/`)

`index.html` (shell com menu lateral) + `app.js` (roteamento por hash, telas e gráficos) +
`style.css` (tema escuro). Gráficos com Chart.js (CDN).

Telas: **Dashboard Geral**, **Lançamentos** (lista + filtros + modal de nova entrada/saída/
transferência), **Relatórios** (DRE consolidado, resultado por empresa, evolução anual),
**página por empresa** (KPIs, mensal, por unidade, por categoria, + AGF 100/40 na Agência) e
**Cadastros** (consulta de empresas/unidades/contas/categorias/centros).

---

## 7. Como rodar

```
npm install
node seed.js            # idempotente; só popula se vazio
node import-excel.js    # opcional: carga do Excel
npm start               # ou: INICIAR PAINEL.bat
```
Banco: `data/ricci.db`. Acesso: http://localhost:3500.

A pasta do app fica **fora do OneDrive** (`C:\Users\Win10\gestao-ricci-app`) para o `node_modules`
e o banco não sincronizarem. O app lê o Excel no caminho do OneDrive (constantes no topo de
`server.js` / `import-excel.js`).

---

## 8. Roadmap (próximas etapas)

1. **Importação na interface** (upload + mapeamento de colunas + pré-visualização + antiduplicidade).
2. **Caixa e bancos** (saldos, transferências, conciliação, extrato) e **Contas a pagar/receber** dedicadas.
3. **Usuários, login, permissões por empresa** e acesso remoto/hospedagem; backup.
4. Detalhar **Licenciados** (definir o que se inputa de cada ponto).
5. **Rateio de overhead** da BRC para Mais Envios/Agência (hoje a BRC concentra despesas gerais).
6. Lançamentos **recorrentes** e **anexos** (tabelas já previstas no schema).

---

## 9. Limitações desta versão

- Importação é carga única por linha de comando (a tela de importação virá depois).
- Despesas gerais (Fixas, Variáveis, Impostos, Folha) estão atribuídas à **BRC**; ainda não há
  rateio entre as demais frentes.
- 2017 não foi importado; 2018–2019 parciais.
- Sem autenticação ainda (uso local).
- A definição financeira de Faturamento/Custo segue o critério das planilhas (visão de margem do
  grupo), distinta do fluxo bruto de postagem da AGF (R$ 9,2 mi), que aparece só na visão 100%.
