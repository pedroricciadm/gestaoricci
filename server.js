/*
 * Sistema de Gestão Grupo RICCI — servidor (porta 3500)
 * SPA multiempresa + API REST (SQLite) + visão AGF 100%/40% (lida do Excel).
 */
const express = require("express");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const auth = require("./auth");

const PORT = process.env.PORT || 3500;
const BASE = process.env.RICCI_BASE || "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";
const AGF_FILE = process.env.AGF_FILE || path.join(BASE, "AGF - Agência de Correios", "Financeiro Geral - AGF 2026.xlsx");
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const PCT_GRUPO_AGF = 0.40;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

// ---- Permissões por empresa ----
function isAdmin(req) { return req.usuario && req.usuario.perfil === "admin"; }
function empresasPermitidas(usuarioId) {
  return db.prepare("SELECT empresa_id FROM permissoes_usuario_empresa WHERE usuario_id=?").all(usuarioId).map((r) => r.empresa_id);
}
function podeEmpresa(req, empresaId) {
  if (isAdmin(req)) return true;
  if (!req.usuario || !empresaId) return false;
  return empresasPermitidas(req.usuario.id).includes(Number(empresaId));
}
function exigirAdmin(req, res) {
  if (!isAdmin(req)) { res.status(403).json({ error: "Acesso restrito a administradores." }); return false; }
  return true;
}

// Trilha de auditoria — registra ações financeiras sensíveis (nunca derruba a requisição em caso de erro)
const _audStmt = db.prepare("INSERT INTO auditoria (usuario_id,usuario_nome,acao,entidade,entidade_id,detalhe) VALUES (?,?,?,?,?,?)");
function audit(req, acao, entidade, entidadeId, detalhe) {
  try {
    const u = req && req.usuario;
    _audStmt.run(u ? u.id : null, u ? u.nome : null, acao, entidade, entidadeId || null, detalhe || null);
  } catch (_) { /* auditoria não deve quebrar a operação */ }
}

// garante seed na primeira execução
if (db.prepare("SELECT COUNT(*) n FROM empresas").get().n === 0) {
  require("./seed");
}

const app = express();
app.use(express.json());

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */
// Rate-limit simples de login (anti brute-force), em memória, por IP+e-mail
const LOGIN_MAX = 5, LOGIN_JANELA_MS = 15 * 60 * 1000;
const loginTentativas = new Map();
function loginKey(req, email) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  return ip + "|" + String(email || "").toLowerCase();
}
function registrarFalha(key) {
  const e = loginTentativas.get(key) || { n: 0, ts: Date.now() };
  if (Date.now() - e.ts > LOGIN_JANELA_MS) { e.n = 0; e.ts = Date.now(); }
  e.n++; loginTentativas.set(key, e);
}
function bloqueado(key) {
  const e = loginTentativas.get(key);
  if (!e) return false;
  if (Date.now() - e.ts > LOGIN_JANELA_MS) { loginTentativas.delete(key); return false; }
  return e.n >= LOGIN_MAX;
}

app.post("/api/login", (req, res) => {
  const { email, senha } = req.body || {};
  const key = loginKey(req, email);
  if (bloqueado(key))
    return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
  const u = db.prepare("SELECT * FROM usuarios WHERE lower(email)=lower(?) AND ativo=1").get(email || "");
  if (!u || !auth.verifySenha(senha || "", u.senha_hash)) {
    registrarFalha(key);
    return res.status(401).json({ error: "E-mail ou senha inválidos" });
  }
  loginTentativas.delete(key); // sucesso zera o contador
  const token = auth.criarSessao(u.id);
  const secure = req.headers["x-forwarded-proto"] === "https" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `ricci_sess=${token}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=2592000`);
  res.json({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil });
});

app.post("/api/logout", (req, res) => {
  auth.removerSessao(auth.tokenDoCookie(req));
  res.setHeader("Set-Cookie", "ricci_sess=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const u = auth.usuarioPorSessao(auth.tokenDoCookie(req));
  if (!u) return res.status(401).json({ error: "não autenticado" });
  res.json(u);
});

// protege as demais rotas /api/* (exceto login/logout/me acima e estáticos abaixo)
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const u = auth.usuarioPorSessao(auth.tokenDoCookie(req));
  if (!u) return res.status(401).json({ error: "não autenticado" });
  req.usuario = u;
  next();
});

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
    WHERE l.deletado=0 ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
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
    LEFT JOIN lancamentos l ON l.empresa_id=e.id AND l.deletado=0 ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
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
    WHERE l.deletado=0 AND l.tipo=@tipo ${ano ? "AND substr(l.data_competencia,1,4)=@ano" : ""}
      ${empresaId ? "AND l.empresa_id=@empresaId" : "AND e.consolida=1"}
    GROUP BY c.id ORDER BY total DESC
  `).all({ ano: String(ano), tipo, empresaId }).map((r) => ({ nome: r.nome, total: num(r.total) }));
}

function anosDisponiveis() {
  const rows = db.prepare(`SELECT DISTINCT substr(data_competencia,1,4) ano FROM lancamentos WHERE deletado=0 ORDER BY ano DESC`).all();
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
app.get("/api/empresas", (req, res) => {
  const todas = db.prepare("SELECT * FROM empresas WHERE ativa=1 ORDER BY ordem").all();
  if (isAdmin(req)) return res.json(todas);
  const permitidas = empresasPermitidas(req.usuario.id);
  res.json(todas.filter((e) => permitidas.includes(e.id)));
});
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
  if (!exigirAdmin(req, res)) return;
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
  if (empresa_id && !podeEmpresa(req, empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const w = ["l.deletado=0"], p = {};
  if (!isAdmin(req) && !empresa_id) {
    const ids = empresasPermitidas(req.usuario.id);
    w.push(`l.empresa_id IN (${ids.length ? ids.map((x) => Number(x)).join(",") : "0"})`);
  }
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
  if (!podeEmpresa(req, req.body.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const d = upsertLanc(req.body);
  const r = db.prepare(`INSERT INTO lancamentos
    (empresa_id,unidade_id,conta_id,pessoa_id,categoria_id,centro_custo_id,conta_destino_id,tipo,descricao,
     data_competencia,data_vencimento,data_pagamento,valor_bruto,desconto,taxa,valor_liquido,status,recorrente,observacoes,origem)
    VALUES (@empresa_id,@unidade_id,@conta_id,@pessoa_id,@categoria_id,@centro_custo_id,@conta_destino_id,@tipo,@descricao,
     @data_competencia,@data_vencimento,@data_pagamento,@valor_bruto,@desconto,@taxa,@valor_liquido,@status,@recorrente,@observacoes,'manual')`).run(d);
  audit(req, "criar", "lancamento", r.lastInsertRowid, `${d.tipo} ${d.valor_liquido} ${d.data_competencia} ${d.descricao || ""}`.trim());
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/lancamentos/:id", (req, res) => {
  const atual = db.prepare("SELECT empresa_id FROM lancamentos WHERE id=?").get(req.params.id);
  if (!atual) return res.status(404).json({ error: "lançamento não encontrado" });
  if (!podeEmpresa(req, atual.empresa_id) || !podeEmpresa(req, req.body.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const d = upsertLanc(req.body);
  db.prepare(`UPDATE lancamentos SET empresa_id=@empresa_id,unidade_id=@unidade_id,conta_id=@conta_id,pessoa_id=@pessoa_id,
    categoria_id=@categoria_id,centro_custo_id=@centro_custo_id,conta_destino_id=@conta_destino_id,tipo=@tipo,descricao=@descricao,
    data_competencia=@data_competencia,data_vencimento=@data_vencimento,data_pagamento=@data_pagamento,
    valor_bruto=@valor_bruto,desconto=@desconto,taxa=@taxa,valor_liquido=@valor_liquido,status=@status,recorrente=@recorrente,
    observacoes=@observacoes,updated_at=datetime('now','localtime') WHERE id=@id`).run({ ...d, id: req.params.id });
  audit(req, "editar", "lancamento", Number(req.params.id), `${d.tipo} ${d.valor_liquido} ${d.data_competencia} ${d.descricao || ""}`.trim());
  res.json({ ok: true });
});

app.delete("/api/lancamentos/:id", (req, res) => {
  const atual = db.prepare("SELECT * FROM lancamentos WHERE id=?").get(req.params.id);
  if (!atual) return res.status(404).json({ error: "lançamento não encontrado" });
  if (!podeEmpresa(req, atual.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  // Soft delete: preserva o histórico (recuperável), some das telas e dos totais
  db.prepare("UPDATE lancamentos SET deletado=1, updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  audit(req, "excluir", "lancamento", atual.id, `${atual.tipo} ${atual.valor_liquido} ${atual.data_competencia} ${atual.descricao || ""}`.trim());
  res.json({ ok: true });
});

// Baixa rápida (marcar pago/recebido + data de pagamento)
app.post("/api/lancamentos/:id/baixar", (req, res) => {
  const atual = db.prepare("SELECT empresa_id FROM lancamentos WHERE id=?").get(req.params.id);
  if (atual && !podeEmpresa(req, atual.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  db.prepare(`UPDATE lancamentos SET status=@status,
    data_pagamento=COALESCE(@dp, date('now','localtime')), updated_at=datetime('now','localtime')
    WHERE id=@id`).run({ status: req.body.status || "pago", dp: req.body.data_pagamento || null, id: req.params.id });
  audit(req, "baixar", "lancamento", Number(req.params.id), req.body.status || "pago");
  res.json({ ok: true });
});

// Importação de planilha (recebe lançamentos já mapeados em JSON)
app.post("/api/importar", (req, res) => {
  const { lancamentos, evitarDuplicados } = req.body || {};
  if (!Array.isArray(lancamentos) || !lancamentos.length)
    return res.status(400).json({ error: "Nada para importar." });
  if (!isAdmin(req)) {
    const permit = new Set(empresasPermitidas(req.usuario.id));
    if (lancamentos.some((l) => !permit.has(Number(l.empresa_id)))) return res.status(403).json({ error: "A importação contém empresa sem acesso." });
  }

  // cache de categorias por nome (resolve ou cria)
  const catByNome = {};
  for (const c of db.prepare("SELECT id,nome FROM categorias").all()) catByNome[c.nome.trim().toLowerCase()] = c.id;
  const getCatId = (nome, tipo) => {
    if (!nome) return null;
    const k = String(nome).trim().toLowerCase();
    if (catByNome[k]) return catByNome[k];
    const r = db.prepare("INSERT INTO categorias (nome,tipo) VALUES (?,?)").run(String(nome).trim(), tipo === "entrada" ? "receita" : "despesa");
    catByNome[k] = r.lastInsertRowid;
    return r.lastInsertRowid;
  };

  const ins = db.prepare(`INSERT INTO lancamentos
    (empresa_id,unidade_id,categoria_id,tipo,descricao,data_competencia,data_vencimento,valor_liquido,valor_bruto,status,origem)
    VALUES (@empresa_id,@unidade_id,@categoria_id,@tipo,@descricao,@data_competencia,@data_vencimento,@valor,@valor,@status,'importacao-ui')`);
  const dupCheck = db.prepare(`SELECT COUNT(*) n FROM lancamentos
    WHERE empresa_id=@empresa_id AND data_competencia=@data_competencia AND deletado=0
      AND round(valor_liquido,2)=round(@valor,2) AND IFNULL(descricao,'')=IFNULL(@descricao,'')`);

  let inserted = 0, skipped = 0; const errors = [];
  const tx = db.transaction(() => {
    lancamentos.forEach((l, i) => {
      const valor = Number(l.valor_liquido);
      if (!l.empresa_id || !l.tipo || !l.data_competencia || !(valor > 0)) {
        errors.push({ linha: l.linha || i + 1, motivo: "empresa/tipo/data/valor inválidos" });
        return;
      }
      const rec = {
        empresa_id: l.empresa_id, unidade_id: l.unidade_id || null,
        categoria_id: l.categoria_id || getCatId(l.categoria_nome, l.tipo),
        tipo: l.tipo, descricao: l.descricao || "", data_competencia: l.data_competencia,
        data_vencimento: l.data_vencimento || null, valor, status: l.status || "confirmado",
      };
      if (evitarDuplicados && dupCheck.get({ empresa_id: rec.empresa_id, data_competencia: rec.data_competencia, valor, descricao: rec.descricao }).n > 0) {
        skipped++; return;
      }
      ins.run(rec); inserted++;
    });
  });
  tx();
  audit(req, "importar", "lancamento", null, `inseridos=${inserted} pulados=${skipped} erros=${errors.length}`);
  res.json({ inserted, skipped, totalErros: errors.length, errors: errors.slice(0, 50) });
});

/* ------------------------------------------------------------------ */
/* API — recorrências (lançamentos fixos mensais)                      */
/* ------------------------------------------------------------------ */
app.get("/api/recorrencias", (req, res) => {
  const emp = req.query.empresa_id;
  if (emp && !podeEmpresa(req, emp)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const rows = db.prepare(`SELECT r.*, c.nome categoria_nome, u.nome unidade_nome, ct.nome conta_nome
    FROM recorrencias r LEFT JOIN categorias c ON c.id=r.categoria_id LEFT JOIN unidades u ON u.id=r.unidade_id
    LEFT JOIN contas_financeiras ct ON ct.id=r.conta_id
    WHERE r.ativa=1 ${emp ? "AND r.empresa_id=@emp" : ""} ORDER BY r.tipo, r.descricao`).all(emp ? { emp } : {});
  res.json(rows);
});
app.post("/api/recorrencias", (req, res) => {
  const b = req.body || {};
  if (!b.empresa_id || !b.tipo || !(Number(b.valor) > 0)) return res.status(400).json({ error: "empresa, tipo e valor são obrigatórios" });
  if (!podeEmpresa(req, b.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const r = db.prepare(`INSERT INTO recorrencias (empresa_id,unidade_id,conta_id,categoria_id,centro_custo_id,pessoa_id,tipo,descricao,valor,dia_vencimento,ativa)
    VALUES (@empresa_id,@unidade_id,@conta_id,@categoria_id,@centro_custo_id,@pessoa_id,@tipo,@descricao,@valor,@dia,1)`).run({
    empresa_id: b.empresa_id, unidade_id: b.unidade_id || null, conta_id: b.conta_id || null, categoria_id: b.categoria_id || null,
    centro_custo_id: b.centro_custo_id || null, pessoa_id: b.pessoa_id || null, tipo: b.tipo, descricao: b.descricao || "",
    valor: Number(b.valor), dia: Number(b.dia_vencimento) || 5,
  });
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/recorrencias/:id", (req, res) => {
  const cur = db.prepare("SELECT empresa_id FROM recorrencias WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "recorrência não encontrada" });
  if (!podeEmpresa(req, cur.empresa_id) || !podeEmpresa(req, req.body.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const b = req.body;
  db.prepare(`UPDATE recorrencias SET empresa_id=@empresa_id,unidade_id=@unidade_id,conta_id=@conta_id,categoria_id=@categoria_id,centro_custo_id=@centro_custo_id,pessoa_id=@pessoa_id,tipo=@tipo,descricao=@descricao,valor=@valor,dia_vencimento=@dia WHERE id=@id`).run({
    empresa_id: b.empresa_id, unidade_id: b.unidade_id || null, conta_id: b.conta_id || null, categoria_id: b.categoria_id || null,
    centro_custo_id: b.centro_custo_id || null, pessoa_id: b.pessoa_id || null, tipo: b.tipo, descricao: b.descricao || "",
    valor: Number(b.valor), dia: Number(b.dia_vencimento) || 5, id: req.params.id,
  });
  res.json({ ok: true });
});
app.delete("/api/recorrencias/:id", (req, res) => {
  const cur = db.prepare("SELECT empresa_id FROM recorrencias WHERE id=?").get(req.params.id);
  if (cur && !podeEmpresa(req, cur.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  db.prepare("UPDATE recorrencias SET ativa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.post("/api/recorrencias/gerar", (req, res) => {
  const { empresa_id, ano, mes } = req.body || {};
  if (!empresa_id || !ano || !mes) return res.status(400).json({ error: "empresa_id, ano e mes são obrigatórios" });
  if (!podeEmpresa(req, empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const mm = String(mes).padStart(2, "0"), ym = `${ano}-${mm}`;
  const recs = db.prepare("SELECT * FROM recorrencias WHERE ativa=1 AND empresa_id=?").all(empresa_id);
  const jaExiste = db.prepare("SELECT COUNT(*) n FROM lancamentos WHERE recorrencia_id=@rid AND substr(data_competencia,1,7)=@ym AND deletado=0");
  const ins = db.prepare(`INSERT INTO lancamentos (empresa_id,unidade_id,conta_id,categoria_id,centro_custo_id,pessoa_id,tipo,descricao,data_competencia,data_vencimento,valor_liquido,valor_bruto,status,origem,recorrencia_id)
    VALUES (@empresa_id,@unidade_id,@conta_id,@categoria_id,@centro_custo_id,@pessoa_id,@tipo,@descricao,@data,@data,@valor,@valor,'pendente','recorrente',@rid)`);
  let gerados = 0, pulados = 0;
  const tx = db.transaction(() => {
    for (const r of recs) {
      if (jaExiste.get({ rid: r.id, ym }).n > 0) { pulados++; continue; }
      const dia = String(Math.min(28, r.dia_vencimento || 5)).padStart(2, "0");
      ins.run({
        empresa_id: r.empresa_id, unidade_id: r.unidade_id, conta_id: r.conta_id, categoria_id: r.categoria_id,
        centro_custo_id: r.centro_custo_id, pessoa_id: r.pessoa_id, tipo: r.tipo, descricao: (r.descricao || "") + " (recorrente)",
        data: `${ano}-${mm}-${dia}`, valor: r.valor, rid: r.id,
      });
      gerados++;
    }
  });
  tx();
  res.json({ gerados, pulados });
});

/* ------------------------------------------------------------------ */
/* API — contas financeiras (CRUD + saldos)                            */
/* ------------------------------------------------------------------ */
app.get("/api/contas/saldos", (req, res) => {
  const emp = req.query.empresa_id ? Number(req.query.empresa_id) : null;
  if (emp && !podeEmpresa(req, emp)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  if (!emp && !isAdmin(req)) return res.status(403).json({ error: "Selecione uma empresa." });
  res.json(db.prepare(`
    SELECT c.id, c.nome, c.banco, c.tipo, c.empresa_id, e.nome empresa_nome, c.saldo_inicial,
      c.saldo_inicial
      + COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='entrada' AND deletado=0),0)
      - COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='saida' AND deletado=0),0)
      + COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_destino_id=c.id AND tipo='transferencia' AND deletado=0),0)
      - COALESCE((SELECT SUM(valor_liquido) FROM lancamentos WHERE conta_id=c.id AND tipo='transferencia' AND deletado=0),0) AS saldo,
      (SELECT COUNT(*) FROM lancamentos WHERE (conta_id=c.id OR conta_destino_id=c.id) AND deletado=0) movimentos
    FROM contas_financeiras c LEFT JOIN empresas e ON e.id=c.empresa_id
    WHERE c.ativa=1 AND (@emp IS NULL OR c.empresa_id=@emp) ORDER BY e.ordem, c.nome`).all({ emp }));
});
app.get("/api/contas/:id/extrato", (req, res) => {
  const c = db.prepare("SELECT empresa_id FROM contas_financeiras WHERE id=?").get(req.params.id);
  if (c && !podeEmpresa(req, c.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  res.json(db.prepare(`
    SELECT l.*, e.nome empresa_nome, c.nome categoria_nome,
      CASE WHEN l.conta_destino_id=@id AND l.tipo='transferencia' THEN 'entrada_transf'
           WHEN l.conta_id=@id AND l.tipo='transferencia' THEN 'saida_transf'
           ELSE l.tipo END mov
    FROM lancamentos l JOIN empresas e ON e.id=l.empresa_id LEFT JOIN categorias c ON c.id=l.categoria_id
    WHERE (l.conta_id=@id OR l.conta_destino_id=@id) AND l.deletado=0
    ORDER BY l.data_competencia DESC, l.id DESC LIMIT 300`).all({ id: req.params.id }));
});
app.post("/api/contas", (req, res) => {
  const b = req.body;
  if (b.empresa_id && !podeEmpresa(req, b.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  if (!b.empresa_id && !isAdmin(req)) return res.status(403).json({ error: "Selecione uma empresa." });
  const r = db.prepare("INSERT INTO contas_financeiras (empresa_id,nome,banco,tipo,saldo_inicial) VALUES (?,?,?,?,?)")
    .run(b.empresa_id || null, b.nome, b.banco || null, b.tipo || "conta_corrente", num(b.saldo_inicial));
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/contas/:id", (req, res) => {
  const b = req.body;
  const c = db.prepare("SELECT empresa_id FROM contas_financeiras WHERE id=?").get(req.params.id);
  if (c && !podeEmpresa(req, c.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  if (b.empresa_id && !podeEmpresa(req, b.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  db.prepare("UPDATE contas_financeiras SET empresa_id=?,nome=?,banco=?,tipo=?,saldo_inicial=? WHERE id=?")
    .run(b.empresa_id || null, b.nome, b.banco || null, b.tipo || "conta_corrente", num(b.saldo_inicial), req.params.id);
  res.json({ ok: true });
});
app.delete("/api/contas/:id", (req, res) => {
  const c = db.prepare("SELECT empresa_id FROM contas_financeiras WHERE id=?").get(req.params.id);
  if (c && !podeEmpresa(req, c.empresa_id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  db.prepare("UPDATE contas_financeiras SET ativa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Usuários (admin) — listar / criar / atualizar / excluir + vínculo com empresas
function setEmpresasUsuario(usuarioId, empresaIds) {
  db.prepare("DELETE FROM permissoes_usuario_empresa WHERE usuario_id=?").run(usuarioId);
  const ins = db.prepare("INSERT INTO permissoes_usuario_empresa (usuario_id,empresa_id,permissao) VALUES (?,?,'escrita')");
  (empresaIds || []).forEach((eid) => { if (eid) ins.run(usuarioId, Number(eid)); });
}
app.get("/api/usuarios", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  res.json(db.prepare("SELECT id,nome,email,perfil,ativo FROM usuarios ORDER BY nome").all());
});
app.get("/api/usuarios/:id/empresas", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  res.json(empresasPermitidas(Number(req.params.id)));
});
app.post("/api/usuarios", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const { nome, email, senha, perfil, empresa_ids } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ error: "nome, email e senha são obrigatórios" });
  const existe = db.prepare("SELECT id FROM usuarios WHERE lower(email)=lower(?)").get(email);
  if (existe) return res.status(409).json({ error: "já existe usuário com esse e-mail" });
  const r = db.prepare("INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo) VALUES (?,?,?,?,1)")
    .run(nome, email, auth.hashSenha(senha), perfil || "usuario");
  if (perfil !== "admin") setEmpresasUsuario(r.lastInsertRowid, empresa_ids);
  res.json({ id: r.lastInsertRowid });
});
app.put("/api/usuarios/:id", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const { nome, email, senha, perfil, ativo, empresa_ids } = req.body || {};
  const u = db.prepare("SELECT * FROM usuarios WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "usuário não encontrado" });
  if (email && email.toLowerCase() !== u.email.toLowerCase()) {
    const dup = db.prepare("SELECT id FROM usuarios WHERE lower(email)=lower(?) AND id<>?").get(email, u.id);
    if (dup) return res.status(409).json({ error: "já existe usuário com esse e-mail" });
  }
  db.prepare("UPDATE usuarios SET nome=?, email=?, perfil=?, ativo=?, senha_hash=? WHERE id=?").run(
    nome || u.nome, email || u.email, perfil || u.perfil,
    ativo == null ? u.ativo : (ativo ? 1 : 0),
    senha ? auth.hashSenha(senha) : u.senha_hash, req.params.id);
  const perfilFinal = perfil || u.perfil;
  if (perfilFinal === "admin") setEmpresasUsuario(req.params.id, []);
  else if (empresa_ids !== undefined) setEmpresasUsuario(req.params.id, empresa_ids);
  res.json({ ok: true });
});
app.delete("/api/usuarios/:id", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (req.usuario && req.usuario.id === id) return res.status(400).json({ error: "Você não pode excluir o próprio usuário logado." });
  const u = db.prepare("SELECT * FROM usuarios WHERE id=?").get(id);
  if (!u) return res.status(404).json({ error: "usuário não encontrado" });
  const admins = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE perfil='admin' AND ativo=1").get().n;
  if (u.perfil === "admin" && admins <= 1) return res.status(400).json({ error: "Não é possível excluir o último administrador." });
  db.prepare("DELETE FROM permissoes_usuario_empresa WHERE usuario_id=?").run(id);
  db.prepare("DELETE FROM sessoes WHERE usuario_id=?").run(id);
  db.prepare("DELETE FROM usuarios WHERE id=?").run(id);
  res.json({ ok: true });
});

// POST simples de categorias e centros de custo
app.post("/api/categorias", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const r = db.prepare("INSERT INTO categorias (nome,tipo) VALUES (?,?)").run(req.body.nome, req.body.tipo || "despesa");
  res.json({ id: r.lastInsertRowid });
});
app.post("/api/centros-custo", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const r = db.prepare("INSERT INTO centros_custo (empresa_id,nome) VALUES (?,?)").run(req.body.empresa_id || null, req.body.nome);
  res.json({ id: r.lastInsertRowid });
});

/* ------------------------------------------------------------------ */
/* API — dashboard consolidado e por empresa                          */
/* ------------------------------------------------------------------ */
app.get("/api/dashboard", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const anos = anosDisponiveis();
  const ano = Number(req.query.ano) || anos[0] || 2026;
  const sm = serieMensal(ano, null);
  const empresas = porEmpresa(ano);
  const fam = empresas.find((e) => e.nome === "Família");
  const fatTot = sm.entrada.reduce((a, b) => a + b, 0);
  const custoTot = sm.saida.reduce((a, b) => a + b, 0); // já exclui Família (consolida=0)
  const familiaTot = fam ? fam.despesa : 0;
  const ant = serieMensal(ano - 1, null);
  const antFat = ant.entrada.reduce((a, b) => a + b, 0), antCusto = ant.saida.reduce((a, b) => a + b, 0);
  // Meses fechados: exclui o mês corrente (em andamento) e meses futuros, p/ comparar receita e custo no mesmo período.
  const hoje = new Date();
  const ateMes = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : hoje.getMonth(); // getMonth() = mês corrente-1 (0-base) = nº de meses fechados
  const famSerie = fam ? serieMensal(ano, fam.id) : { saida: Array(12).fill(0) };
  const somaAte = (arr) => arr.slice(0, ateMes).reduce((s, v) => s + v, 0);
  const mfFat = somaAte(sm.entrada), mfCusto = somaAte(sm.saida), mfFam = somaAte(famSerie.saida);
  res.json({
    ano, anos,
    kpis: {
      faturamento: fatTot, custo: custoTot, resultadoOperacional: fatTot - custoTot,
      distribuicaoFamiliar: familiaTot, resultadoAposFamilia: fatTot - custoTot - familiaTot,
    },
    mesesFechados: {
      ateMes, // quantos meses fechados (0..12)
      rotulo: ateMes > 0 ? `jan–${MESES[ateMes - 1].toLowerCase()}` : null,
      parcial: ateMes > 0 && ateMes < 12,
      faturamento: mfFat, custo: mfCusto, resultadoOperacional: mfFat - mfCusto,
      distribuicaoFamiliar: mfFam, resultadoAposFamilia: mfFat - mfCusto - mfFam,
    },
    anterior: { ano: ano - 1, faturamento: antFat, custo: antCusto, resultadoOperacional: antFat - antCusto },
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
  if (!podeEmpresa(req, id)) return res.status(403).json({ error: "Sem acesso a esta empresa." });
  const anos = anosDisponiveis();
  const ano = Number(req.query.ano) || anos[0] || 2026;
  const emp = db.prepare("SELECT * FROM empresas WHERE id=?").get(id);
  if (!emp) return res.status(404).json({ error: "empresa não encontrada" });
  const sm = serieMensal(ano, id);
  const fat = sm.entrada.reduce((a, b) => a + b, 0), desp = sm.saida.reduce((a, b) => a + b, 0);
  const antE = serieMensal(ano - 1, id);
  const antEFat = antE.entrada.reduce((a, b) => a + b, 0), antEDesp = antE.saida.reduce((a, b) => a + b, 0);
  // por unidade
  const porUnidade = db.prepare(`
    SELECT COALESCE(u.nome,'(sem unidade)') nome,
      SUM(CASE WHEN l.tipo='entrada' THEN l.valor_liquido ELSE 0 END) faturamento,
      SUM(CASE WHEN l.tipo='saida' THEN l.valor_liquido ELSE 0 END) despesa
    FROM lancamentos l LEFT JOIN unidades u ON u.id=l.unidade_id
    WHERE l.empresa_id=@id AND l.deletado=0 AND substr(l.data_competencia,1,4)=@ano
    GROUP BY u.id ORDER BY faturamento DESC
  `).all({ id, ano: String(ano) }).map((r) => ({ nome: r.nome, faturamento: num(r.faturamento), despesa: num(r.despesa) }));
  res.json({
    ano, anos, empresa: emp,
    kpis: { faturamento: fat, despesa: desp, resultado: fat - desp,
      participacao: emp.percentual_participacao,
      resultadoAtribuivel: (fat - desp) * (emp.percentual_participacao / 100) },
    anterior: { ano: ano - 1, faturamento: antEFat, despesa: antEDesp, resultado: antEFat - antEDesp },
    serieMensal: { meses: MESES, entrada: sm.entrada, saida: sm.saida, resultado: sm.entrada.map((v, i) => v - sm.saida[i]) },
    porCategoriaReceita: porCategoria(ano, "entrada", id),
    porCategoriaDespesa: porCategoria(ano, "saida", id),
    porUnidade,
    agf: emp.nome === "Agência dos Correios" ? buildAGF() : null,
  });
});

app.get("/api/health", (req, res) => res.json({ ok: true, empresas: db.prepare("SELECT COUNT(*) n FROM empresas").get().n, lancamentos: db.prepare("SELECT COUNT(*) n FROM lancamentos WHERE deletado=0").get().n }));

// Trilha de auditoria (admin) — últimas ações financeiras registradas
app.get("/api/auditoria", (req, res) => {
  if (!exigirAdmin(req, res)) return;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(db.prepare("SELECT * FROM auditoria ORDER BY id DESC LIMIT ?").all(limit));
});

// fallback SPA (Express 5: usar middleware, não "*")
app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`\n✅ Sistema de Gestão Grupo RICCI em http://localhost:${PORT}`);
  console.log(`   Empresas: ${db.prepare("SELECT COUNT(*) n FROM empresas").get().n} | Lançamentos: ${db.prepare("SELECT COUNT(*) n FROM lancamentos").get().n}`);
});
