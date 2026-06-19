/*
 * Sistema de Gestão Grupo RICCI — servidor (porta 3500)
 * SPA multiempresa + API REST (SQLite) + visão AGF 100%/40% (lida do Excel).
 */
const express = require("express");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const db = require("./db");

const PORT = process.env.PORT || 3500;
const BASE = process.env.RICCI_BASE || "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";
const AGF_FILE = process.env.AGF_FILE || path.join(BASE, "AGF - Agência de Correios", "Financeiro Geral - AGF 2026.xlsx");
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const PCT_GRUPO_AGF = 0.40;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

// garante seed na primeira execução
if (db.prepare("SELECT COUNT(*) n FROM empresas").get().n === 0) {
  require("./seed");
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------------ */
/* Helpers de agregação                                                */
/* ------------------------------------------------------------------ */
const anoFiltro = (ano) => (ano ? " AND substr(l.data_competencia,1,4)=@ano " : "");

function serieMensal(ano, empresaId) {
  // retorna {entrada:[12], saida:[12]}
  const rows = db.prepare(`
    SELECT CAST(substr(l.data_competencia,6,2) AS INTEGER) mes, l.tipo, SUM(l.valor_liquido) total
    FROM lancamentos l
    JOIN empresas e ON e.id=l.empresa_id
    WHERE 1=1 ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
      ${empresaId ? "AND l.empresa_id=@empresaId" : "AND e.consolida=1"}
    GROUP BY mes, l.tipo
  `).all({ ano: String(ano), empresaId });
  const entrada = Array(12).fill(0), saida = Array(12).fill(0);
  for (const r of rows) {
    if (r.mes >= 1 && r.mes <= 12) {
      if (r.tipo === "entrada") entrada[r.mes - 1] += num(r.total);
      else if (r.tipo === "saida") saida[r.mes - 1] += num(r.total);
    }
  }
  return { entrada, saida };
}

function porEmpresa(ano) {
  return db.prepare(`
    SELECT e.id, e.nome, e.tipo, e.percentual_participacao part, e.consolida, e.cor,
      SUM(CASE WHEN l.tipo='entrada' THEN l.valor_liquido ELSE 0 END) faturamento,
      SUM(CASE WHEN l.tipo='saida' THEN l.valor_liquido ELSE 0 END) despesa
    FROM empresas e
    LEFT JOIN lancamentos l ON l.empresa_id=e.id ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
    WHERE e.tipo!='grupo'
    GROUP BY e.id
    ORDER BY e.ordem
  `).all({ ano: String(ano) }).map((r) => ({
    ...r,
    faturamento: num(r.faturamento), despesa: num(r.despesa),
    resultado: num(r.faturamento) - num(r.despesa),
  }));
}

function porCategoria(ano, tipo, empresaId) {
  return db.prepare(`
    SELECT c.nome, SUM(l.valor_liquido) total
    FROM lancamentos l
    JOIN categorias c ON c.id=l.categoria_id
    JOIN empresas e ON e.id=l.empresa_id
    WHERE l.tipo=@tipo ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
      ${empresaId ? "AND l.empresa_id=@empresaId" : "AND e.consolida=1"}
    GROUP BY c.id ORDER BY total DESC
  `).all({ ano: String(ano), tipo, empresaId }).map((r) => ({ nome: r.nome, total: num(r.total) }));
}

function anosDisponiveis() {
  const rows = db.prepare(`SELECT DISTINCT substr(data_competencia,1,4) ano FROM lancamentos ORDER BY ano DESC`).all();
  return rows.map((r) => Number(r.ano)).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* AGF — operação 100% (lida do Excel) + 40% atribuível ao Grupo       */
/* ------------------------------------------------------------------ */
function buildAGF() {
  if (!fs.existsSync(AGF_FILE)) return null;
  const wb = XLSX.readFile(AGF_FILE, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Resumo Geral"], { header: 1, raw: true, defval: null });
  const MC = [1,2,3,4,5,6,7,8,9,10,11,12];
  const findRow = (l) => rows.find((r) => r && String(r[0] || "").trim().toUpperCase() === l.toUpperCase());
  const line = (l) => { const r = findRow(l); return r ? { name: String(r[0]).trim(), months: MC.map((c) => num(r[c])), media: num(r[13]), total: num(r[14]) } : null; };
  const resultadoSI = line("RESULTADO S/ INVESTIMENTO"), resultadoCI = line("RESULTADO C/ INVESTIMENTO");
  const ap = (l) => (l ? { total: l.total * PCT_GRUPO_AGF, months: l.months.map((v) => v * PCT_GRUPO_AGF) } : null);
  const saldoRow = findRow("Saldo atual");
  return {
    fonte: path.basename(AGF_FILE), atualizadoEm: fs.statSync(AGF_FILE).mtime, pctGrupo: PCT_GRUPO_AGF,
    cem: {
      fatBruto: line("FATURAMENTO BRUTO"), fatLiquido: line("FATURAMENTO LIQUIDO TOTAL"),
      custo: line("CUSTO TOTAL"), resultadoSI, resultadoCI, distribuicao: line("Distribuição de Lucros"),
      saldoAtual: saldoRow ? num(saldoRow[1]) : 0,
    },
    grupo40: { resultadoSI: ap(resultadoSI), resultadoCI: ap(resultadoCI) },
  };
}

/* ------------------------------------------------------------------ */
/* API — cadastros                                                     */
/* ------------------------------------------------------------------ */
app.get("/api/empresas", (req, res) =>
  res.json(db.prepare("SELECT * FROM empresas WHERE ativa=1 ORDER BY ordem").all()));
app.get("/api/unidades", (req, res) =>
  res.json(db.prepare("SELECT * FROM unidades WHERE ativa=1 " + (req.query.empresa_id ? "AND empresa_id=?" : "")).all(...(req.query.empresa_id ? [req.query.empresa_id] : []))));
app.get("/api/contas", (req, res) =>
  res.json(db.prepare("SELECT * FROM contas_financeiras WHERE ativa=1").all()));
app.get("/api/categorias", (req, res) =>
  res.json(db.prepare("SELECT * FROM categorias WHERE ativa=1 ORDER BY tipo,nome").all()));
app.get("/api/centros-custo", (req, res) =>
  res.json(db.prepare("SELECT * FROM centros_custo WHERE ativa=1 ORDER BY nome").all()));
app.get("/api/pessoas", (req, res) =>
  res.json(db.prepare("SELECT * FROM pessoas ORDER BY nome").all()));
app.post("/api/pessoas", (req, res) => {
  const b = req.body;
  const r = db.prepare("INSERT INTO pessoas (nome,tipo,cpf_cnpj,empresa_id,telefone,email,observacoes) VALUES (?,?,?,?,?,?,?)")
    .run(b.nome, b.tipo, b.cpf_cnpj, b.empresa_id || null, b.telefone, b.email, b.observacoes);
  res.json({ id: r.lastInsertRowid });
});

/* ------------------------------------------------------------------ */
/* API — lançamentos (CRUD)                                            */
/* ------------------------------------------------------------------ */
app.get("/api/lancamentos", (req, res) => {
  const { empresa_id, ano, mes, tipo, categoria_id, status, origem, q, limit } = req.query;
  const w = [], p = {};
  if (empresa_id) { w.push("l.empresa_id=@empresa_id"); p.empresa_id = empresa_id; }
  if (ano) { w.push("substr(l.data_competencia,1,4)=@ano"); p.ano = String(ano); }
  if (mes) { w.push("substr(l.data_competencia,6,2)=@mes"); p.mes = String(mes).padStart(2, "0"); }
  if (tipo) { w.push("l.tipo=@tipo"); p.tipo = tipo; }
  if (categoria_id) { w.push("l.categoria_id=@categoria_id"); p.categoria_id = categoria_id; }
  if (status) { w.push("l.status=@status"); p.status = status; }
  if (origem) { w.push("l.origem=@origem"); p.origem = origem; }
  if (q) { w.push("l.descricao LIKE @q"); p.q = "%" + q + "%"; }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const rows = db.prepare(`
    SELECT l.*, e.nome empresa_nome, u.nome unidade_nome, c.nome categoria_nome,
           cc.nome centro_nome, ct.nome conta_nome, p.nome pessoa_nome
    FROM lancamentos l
    JOIN empresas e ON e.id=l.empresa_id
    LEFT JOIN unidades u ON u.id=l.unidade_id
    LEFT JOIN categorias c ON c.id=l.categoria_id
    LEFT JOIN centros_custo cc ON cc.id=l.centro_custo_id
    LEFT JOIN contas_financeiras ct ON ct.id=l.conta_id
    LEFT JOIN pessoas p ON p.id=l.pessoa_id
    ${where}
    ORDER BY l.data_competencia DESC, l.id DESC
    LIMIT @limit
  `).all({ ...p, limit: Number(limit) || 500 });
  res.json(rows);
});

function upsertLanc(b) {
  const bruto = num(b.valor_bruto != null ? b.valor_bruto : b.valor_liquido);
  const desc = num(b.desconto), taxa = num(b.taxa);
  const liquido = b.valor_liquido != null ? num(b.valor_liquido) : bruto - desc - taxa;
  return {
    empresa_id: b.empresa_id, unidade_id: b.unidade_id || null, conta_id: b.conta_id || null,
    pessoa_id: b.pessoa_id || null, categoria_id: b.categoria_id || null, centro_custo_id: b.centro_custo_id || null,
    conta_destino_id: b.conta_destino_id || null,
    tipo: b.tipo, descricao: b.descricao || "", data_competencia: b.data_competencia,
    data_vencimento: b.data_vencimento || null, data_pagamento: b.data_pagamento || null,
    valor_bruto: bruto, desconto: desc, taxa, valor_liquido: liquido,
    status: b.status || "confirmado", recorrente: b.recorrente ? 1 : 0,
    observacoes: b.observacoes || null,
  };
}

app.post("/api/lancamentos", (req, res) => {
  if (!req.body.empresa_id || !req.body.tipo || !req.body.data_competencia)
    return res.status(400).json({ error: "empresa_id, tipo e data_competencia são obrigatórios" });
  const d = upsertLanc(req.body);
  const r = db.prepare(`INSERT INTO lancamentos
    (empresa_id,unidade_id,conta_id,pessoa_id,categoria_id,centro_custo_id,conta_destino_id,tipo,descricao,
     data_competencia,data_vencimento,data_pagamento,valor_bruto,desconto,taxa,valor_liquido,status,recorrente,observacoes,origem)
    VALUES (@empresa_id,@unidade_id,@conta_id,@pessoa_id,@categoria_id,@centro_custo_id,@conta_destino_id,@tipo,@descricao,
     @data_competencia,@data_vencimento,@data_pagamento,@valor_bruto,@desconto,@taxa,@valor_liquido,@status,@recorrente,@observacoes,'manual')`).run(d);
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/lancamentos/:id", (req, res) => {
  const d = upsertLanc(req.body);
  db.prepare(`UPDATE lancamentos SET empresa_id=@empresa_id,unidade_id=@unidade_id,conta_id=@conta_id,pessoa_id=@pessoa_id,
    categoria_id=@categoria_id,centro_custo_id=@centro_custo_id,conta_destino_id=@conta_destino_id,tipo=@tipo,descricao=@descricao,
    data_competencia=@data_competencia,data_vencimento=@data_vencimento,data_pagamento=@data_pagamento,
    valor_bruto=@valor_bruto,desconto=@desconto,taxa=@taxa,valor_liquido=@valor_liquido,status=@status,recorrente=@recorrente,
    observacoes=@observacoes,updated_at=datetime('now','localtime') WHERE id=@id`).run({ ...d, id: req.params.id });
  res.json({ ok: true });
});

app.delete("/api/lancamentos/:id", (req, res) => {
  db.prepare("DELETE FROM lancamentos WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Baixa rápida (marcar pago/recebido + data de pagamento)
app.post("/api/lancamentos/:id/baixar", (req, res) => {
  db.prepare(`UPDATE lancamentos SET status=@status,
    data_pagamento=COALESCE(@dp, date('now','localtime')), updated_at=datetime('now','localtime')
    WHERE id=@id`).run({ status: req.body.status || "pago", dp: req.body.data_pagamento || null, id: req.params.id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* API — contas financeiras (CRUD + saldos)                            */
/* ------------------------------------------------------------------ */
app.get("/api/contas/saldos", (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.nome, c.banco, c.tipo, c.empresa_id, e.nome empresa_nome, c.saldo_inicial,
      c.saldo_inicial
      + COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='entrada'),0)
      - COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='saida'),0)
      + COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_destino_id=c.id AND tipo='transferencia'),0)
      - COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='transferencia'),0) AS saldo,
      (SELECT COUNT(*) FROM lancamentos WHERE conta_id=c.id OR conta_destino_id=c.id) movimentos
    FROM contas_financeiras c LEFT JOIN empresas e ON e.id=c.empresa_id
    WHERE c.ativa=1 ORDER BY e.ordem, c.nome`).all());
});
app.get("/api/contas/:id/extrato", (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, e.nome empresa_nome, c.nome categoria_nome,
      CASE WHEN l.conta_destino_id=@id AND l.tipo='transferencia' THEN 'entrada_transf'
           WHEN l.conta_id=@id AND l.tipo='transferencia' THEN 'saida_transf'
           ELSE l.tipo END mov
    FROM lancamentos l JOIN empresas e ON e.id=l.empresa_id LEFT JOIN categorias c ON c.id=l.categoria_id
    WHERE l.conta_id=@id OR l.conta_destino_id=@id
    ORDER BY l.data_competencia DESC, l.id DESC LIMIT 300`).all({ id: req.params.id }));
});
app.post("/api/contas", (req, res) => {
  const b = req.body;
  const r = db.prepare("INSERT INTO contas_financeiras (empresa_id,nome,banco,tipo,saldo_inicial) VALUES (?,?,?,?,?)")
    .run(b.empresa_id || null, b.nome, b.banco || null, b.tipo || "conta_corrente", num(b.saldo_inicial));
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/contas/:id", (req, res) => {
  const b = req.body;
  db.prepare("UPDATE contas_financeiras SET empresa_id=?,nome=?,banco=?,tipo=?,saldo_inicial=? WHERE id=?")
    .run(b.empresa_id || null, b.nome, b.banco || null, b.tipo || "conta_corrente", num(b.saldo_inicial), req.params.id);
  res.json({ ok: true });
});
app.delete("/api/contas/:id", (req, res) => {
  db.prepare("UPDATE contas_financeiras SET ativa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST simples de categorias e centros de custo
app.post("/api/categorias", (req, res) => {
  const r = db.prepare("INSERT INTO categorias (nome,tipo) VALUES (?,?)").run(req.body.nome, req.body.tipo || "despesa");
  res.json({ id: r.lastInsertRowid });
});
app.post("/api/centros-custo", (req, res) => {
  const r = db.prepare("INSERT INTO centros_custo (empresa_id,nome) VALUES (?,?)").run(req.body.empresa_id || null, req.body.nome);
  res.json({ id: r.lastInsertRowid });
});

/* ------------------------------------------------------------------ */
/* API — dashboard consolidado e por empresa                          */
/* ------------------------------------------------------------------ */
app.get("/api/dashboard", (req, res) => {
  const anos = anosDisponiveis();
  const ano = Number(req.query.ano) || anos[0] || 2026;
  const sm = serieMensal(ano, null);
  const empresas = porEmpresa(ano);
  const fam = empresas.find((e) => e.nome === "Família");
  const fatTot = sm.entrada.reduce((a, b) => a + b, 0);
  const custoTot = sm.saida.reduce((a, b) => a + b, 0); // já exclui Família (consolida=0)
  const familiaTot = fam ? fam.despesa : 0;
  res.json({
    ano, anos,
    kpis: {
      faturamento: fatTot, custo: custoTot, resultadoOperacional: fatTot - custoTot,
      distribuicaoFamiliar: familiaTot, resultadoAposFamilia: fatTot - custoTot - familiaTot,
    },
    serieMensal: { meses: MESES, entrada: sm.entrada, saida: sm.saida,
      resultado: sm.entrada.map((v, i) => v - sm.saida[i]) },
    porEmpresa: empresas,
    porCategoriaDespesa: porCategoria(ano, "saida", null),
    porCategoriaReceita: porCategoria(ano, "entrada", null),
    evolucaoAnual: db.prepare("SELECT * FROM evolucao_anual ORDER BY ano").all(),
    agf: buildAGF(),
  });
});

app.get("/api/empresa/:id/dashboard", (req, res) => {
  const id = Number(req.params.id);
  const anos = anosDisponiveis();
  const ano = Number(req.query.ano) || anos[0] || 2026;
  const emp = db.prepare("SELECT * FROM empresas WHERE id=?").get(id);
  if (!emp) return res.status(404).json({ error: "empresa não encontrada" });
  const sm = serieMensal(ano, id);
  const fat = sm.entrada.reduce((a, b) => a + b, 0), desp = sm.saida.reduce((a, b) => a + b, 0);
  // por unidade
  const porUnidade = db.prepare(`
    SELECT COALESCE(u.nome,'(sem unidade)') nome,
      SUM(CASE WHEN l.tipo='entrada' THEN l.valor_liquido ELSE 0 END) faturamento,
      SUM(CASE WHEN l.tipo='saida' THEN l.valor_liquido ELSE 0 END) despesa
    FROM lancamentos l LEFT JOIN unidades u ON u.id=l.unidade_id
    WHERE l.empresa_id=@id AND substr(l.data_competencia,1,4)=@ano
    GROUP BY u.id ORDER BY faturamento DESC
  `).all({ id, ano: String(ano) }).map((r) => ({ nome: r.nome, faturamento: num(r.faturamento), despesa: num(r.despesa) }));
  res.json({
    ano, anos, empresa: emp,
    kpis: { faturamento: fat, despesa: desp, resultado: fat - desp,
      participacao: emp.percentual_participacao,
      resultadoAtribuivel: (fat - desp) * (emp.percentual_participacao / 100) },
    serieMensal: { meses: MESES, entrada: sm.entrada, saida: sm.saida, resultado: sm.entrada.map((v, i) => v - sm.saida[i]) },
    porCategoriaReceita: porCategoria(ano, "entrada", id),
    porCategoriaDespesa: porCategoria(ano, "saida", id),
    porUnidade,
    agf: emp.nome === "Agência dos Correios" ? buildAGF() : null,
  });
});

app.get("/api/health", (req, res) => res.json({ ok: true, empresas: db.prepare("SELECT COUNT(*) n FROM empresas").get().n, lancamentos: db.prepare("SELECT COUNT(*) n FROM lancamentos").get().n }));

// fallback SPA (Express 5: usar middleware, não "*")
app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`\n✅ Sistema de Gestão Grupo RICCI em http://localhost:${PORT}`);
  console.log(`   Empresas: ${db.prepare("SELECT COUNT(*) n FROM empresas").get().n} | Lançamentos: ${db.prepare("SELECT COUNT(*) n FROM lancamentos").get().n}`);
});
