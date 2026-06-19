/* Sistema de Gestão Grupo RICCI — SPA (vanilla JS) */
const BRL = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRL2 = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PALETTE = ["#4cc2ff","#3fb950","#d29922","#f85149","#a371f7","#56d4dd","#ff7b72","#e3b341","#7ee787","#ffa657"];
const api = (u, o) => fetch(u, o).then((r) => r.json());
const $ = (s, r = document) => r.querySelector(s);
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
Chart.defaults.color = "#8b98a5"; Chart.defaults.borderColor = "#2c3742"; Chart.defaults.font.family = "Segoe UI, system-ui, sans-serif";

let CHARTS = [];
function clearCharts() { CHARTS.forEach((c) => c.destroy()); CHARTS = []; }
function chart(id, cfg) { const c = new Chart(id, cfg); CHARTS.push(c); return c; }

const STATE = { empresas: [], categorias: [], contas: [], unidades: [], centros: [], pessoas: [], anoSel: null };

async function boot() {
  // checa autenticação
  const me = await fetch("/api/me");
  if (me.status === 401) return renderLogin();
  STATE.usuario = await me.json();

  [STATE.empresas, STATE.categorias, STATE.contas, STATE.centros, STATE.pessoas, STATE.unidades] = await Promise.all([
    api("/api/empresas"), api("/api/categorias"), api("/api/contas"), api("/api/centros-custo"),
    api("/api/pessoas"), api("/api/unidades"),
  ]);
  renderNav();
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/dashboard";
  route();
}

function renderLogin() {
  document.querySelector(".app").style.display = "none";
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="login-wrap"><form class="login-card" id="loginForm">
    <div class="login-brand">📊 Grupo RICCI<span>Sistema de Gestão</span></div>
    <label class="fld">E-mail<input id="liEmail" type="email" autocomplete="username" required></label>
    <label class="fld">Senha<input id="liSenha" type="password" autocomplete="current-password" required></label>
    <div class="login-err" id="liErr"></div>
    <button class="btn primary" type="submit" style="width:100%;margin-top:8px">Entrar</button>
  </form></div>`;
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("liEmail").value, senha: document.getElementById("liSenha").value }) });
    if (r.ok) { location.reload(); }
    else { document.getElementById("liErr").textContent = "E-mail ou senha inválidos."; }
  });
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
}

function renderNav() {
  const empresasLinks = STATE.empresas.filter((e) => e.tipo !== "grupo")
    .map((e) => `<a href="#/empresa/${e.id}" data-route="empresa/${e.id}"><span class="dot" style="background:${e.cor || '#888'}"></span>${e.nome}</a>`).join("");
  $("#nav").innerHTML = `
    <a href="#/dashboard" data-route="dashboard">📈 Dashboard Geral</a>
    <a href="#/lancamentos" data-route="lancamentos">💸 Lançamentos</a>
    <div class="nav-group">Financeiro</div>
    <a href="#/caixa" data-route="caixa">🏦 Caixa e Bancos</a>
    <a href="#/pagar" data-route="pagar">📕 Contas a Pagar</a>
    <a href="#/receber" data-route="receber">📗 Contas a Receber</a>
    <a href="#/relatorios" data-route="relatorios">📑 Relatórios</a>
    <div class="nav-group">Empresas / Frentes</div>
    ${empresasLinks}
    <div class="nav-group">Administração</div>
    <a href="#/cadastros" data-route="cadastros">⚙️ Cadastros</a>
    <div class="nav-group">${STATE.usuario ? STATE.usuario.nome : ""}</div>
    <a href="#" id="navLogout">🚪 Sair</a>
  `;
  const lo = document.getElementById("navLogout");
  if (lo) lo.addEventListener("click", (e) => { e.preventDefault(); logout(); });
}
function setActive(route) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

function route() {
  const h = location.hash.replace(/^#\//, "");
  clearCharts();
  if (h === "dashboard") return viewDashboard();
  if (h === "lancamentos") return viewLancamentos();
  if (h === "caixa") return viewCaixa();
  if (h === "pagar") return viewContasStatus("saida");
  if (h === "receber") return viewContasStatus("entrada");
  if (h === "relatorios") return viewRelatorios();
  if (h === "cadastros") return viewCadastros();
  if (h.startsWith("empresa/")) return viewEmpresa(Number(h.split("/")[1]));
  viewDashboard();
}

function anoSelector(anos, anoAtual, onChange) {
  const sel = el(`<select>${anos.map((a) => `<option ${a == anoAtual ? "selected" : ""}>${a}</option>`).join("")}</select>`);
  sel.addEventListener("change", () => onChange(Number(sel.value)));
  return sel;
}

/* ====================== DASHBOARD GERAL ====================== */
async function viewDashboard(ano) {
  setActive("dashboard"); clearCharts();
  const view = $("#view");
  view.innerHTML = "Carregando…";
  const d = await api("/api/dashboard" + (ano ? "?ano=" + ano : ""));
  STATE.anoSel = d.ano;
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Dashboard Geral — Grupo RICCI</h1>
    <div class="sub">Visão consolidada · ${d.kpis.faturamento ? "" : "sem dados no ano"}</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewDashboard(a)),
    el(`<button class="btn primary" onclick="location.hash='#/lancamentos'">+ Lançamento</button>`));
  top.append(right);
  view.append(top);

  view.append(el(`<div class="note">Consolidado operacional exclui <b>Família</b> (distribuição compulsória).
    A <b>Agência dos Correios</b> aparece pelos valores que entram no Grupo; a visão 100%/40% está no card da Agência abaixo e na página da empresa.</div>`));

  const k = d.kpis;
  view.append(el(`<div class="kpis">
    ${kpi("Faturamento", BRL(k.faturamento), "entradas consolidadas")}
    ${kpi("Custo / Despesa", BRL(k.custo), "saídas operacionais")}
    ${kpi("Resultado operacional", BRL(k.resultadoOperacional), k.resultadoOperacional>=0?"superávit":"déficit", k.resultadoOperacional>=0?"pos":"neg")}
    ${kpi("Distribuição familiar", BRL(k.distribuicaoFamiliar), "retiradas (compulsória)")}
    ${kpi("Resultado após família", BRL(k.resultadoAposFamilia), k.resultadoAposFamilia>=0?"superávit":"déficit", k.resultadoAposFamilia>=0?"pos":"neg")}
  </div>`));

  const grid = el(`<div class="grid">
    <div class="card col-8"><h2>Faturamento × Custo × Resultado (mensal)</h2><div class="chart-box"><canvas id="cMensal"></canvas></div></div>
    <div class="card col-4"><h2>Faturamento por empresa</h2><div class="chart-box"><canvas id="cEmp"></canvas></div></div>
    <div class="card col-6"><h2>Resultado por empresa</h2><div class="scroll"><table id="tEmp"></table></div></div>
    <div class="card col-6"><h2>Despesas por categoria</h2><div class="chart-box"><canvas id="cDesp"></canvas></div></div>
    <div class="card col-12"><h2>🏤 Agência dos Correios — gestão 100% / Grupo 40%</h2><div id="agfBox"></div></div>
    <div class="card col-12"><h2>Evolução anual</h2><div class="chart-box" style="height:260px"><canvas id="cEvo"></canvas></div></div>
  </div>`);
  view.append(grid);

  const sm = d.serieMensal, nM = mesesComDados(sm);
  chart("cMensal", lineBarCfg(sm.meses.slice(0,nM), [
    bar("Faturamento", sm.entrada.slice(0,nM), "#4cc2ff"),
    bar("Custo", sm.saida.slice(0,nM), "#f85149"),
    line("Resultado", sm.resultado.slice(0,nM), "#3fb950"),
  ]));

  const emp = d.porEmpresa.filter((e) => e.faturamento > 0);
  chart("cEmp", doughnutCfg(emp.map((e) => e.nome), emp.map((e) => e.faturamento)));

  $("#tEmp").innerHTML = `<thead><tr><th>Empresa</th><th>Faturamento</th><th>Despesa</th><th>Resultado</th><th>Part.</th></tr></thead>
    <tbody>${d.porEmpresa.map((e) => `<tr>
      <td><a href="#/empresa/${e.id}">${e.nome}</a> ${e.consolida ? "" : '<span class="pill amber">não consolida</span>'}</td>
      <td>${BRL(e.faturamento)}</td><td>${BRL(e.despesa)}</td>
      <td class="${e.resultado>=0?'pos':'neg'}">${BRL(e.resultado)}</td>
      <td>${e.part}%</td></tr>`).join("")}</tbody>`;

  const dc = d.porCategoriaDespesa.filter((c) => c.total > 0);
  chart("cDesp", doughnutCfg(dc.map((c) => c.nome), dc.map((c) => c.total)));

  renderAgf($("#agfBox"), d.agf);

  const ev = d.evolucaoAnual.filter((r) => r.faturamento_total > 0 || r.custo_total > 0);
  chart("cEvo", lineBarCfg(ev.map((r) => r.ano), [
    bar("Faturamento", ev.map((r) => r.faturamento_total), "#4cc2ff"),
    bar("Custo", ev.map((r) => r.custo_total), "#f85149"),
    line("Resultado", ev.map((r) => r.resultado), "#3fb950"),
  ]));
}

function renderAgf(box, agf) {
  if (!agf || !agf.cem) { box.innerHTML = '<p class="sub">Arquivo da AGF não encontrado.</p>'; return; }
  const c = agf.cem, pct = Math.round(agf.pctGrupo * 100);
  box.innerHTML = `<p class="sub" style="margin-top:0">Operação exibida a <b>100%</b> (gestão integral). Resultado atribuível ao Grupo: <b>${pct}%</b>.</p>
  <div class="kpis">
    ${kpi("Faturamento bruto (100%)", BRL(c.fatBruto?.total))}
    ${kpi("Faturamento líquido (100%)", BRL(c.fatLiquido?.total))}
    ${kpi("Resultado Agência (100%)", BRL(c.resultadoCI?.total), "c/ investimento", c.resultadoCI?.total>=0?"pos":"neg")}
    ${kpi(`Atribuível ao Grupo (${pct}%)`, BRL(agf.grupo40?.resultadoCI?.total), "c/ investimento", "pos")}
    ${kpi("Saldo de caixa da Agência", BRL(c.saldoAtual))}
  </div>`;
}

/* ====================== EMPRESA ====================== */
async function viewEmpresa(id, ano) {
  setActive("empresa/" + id); clearCharts();
  const view = $("#view"); view.innerHTML = "Carregando…";
  const d = await api(`/api/empresa/${id}/dashboard` + (ano ? "?ano=" + ano : ""));
  if (d.error) { view.innerHTML = "Empresa não encontrada."; return; }
  view.innerHTML = "";
  const e = d.empresa;
  const top = el(`<div class="topbar"><div><h1>${e.nome}</h1>
    <div class="sub">${e.tipo}${e.percentual_participacao < 100 ? " · participação do Grupo " + e.percentual_participacao + "%" : ""}${e.consolida ? "" : " · não consolida no resultado operacional"}</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewEmpresa(id, a)),
    el(`<button class="btn primary" id="btnNovo">+ Lançamento</button>`));
  top.append(right); view.append(top);
  right.querySelector("#btnNovo").addEventListener("click", () => openLancModal({ empresa_id: id }, () => viewEmpresa(id, d.ano)));

  const k = d.kpis;
  view.append(el(`<div class="kpis">
    ${kpi("Faturamento", BRL(k.faturamento))}
    ${kpi("Despesa", BRL(k.despesa))}
    ${kpi("Resultado", BRL(k.resultado), "", k.resultado>=0?"pos":"neg")}
    ${e.percentual_participacao < 100 ? kpi(`Atribuível ao Grupo (${e.percentual_participacao}%)`, BRL(k.resultadoAtribuivel), "", "pos") : ""}
  </div>`));

  const grid = el(`<div class="grid">
    <div class="card col-8"><h2>Mensal</h2><div class="chart-box"><canvas id="cM"></canvas></div></div>
    <div class="card col-4"><h2>Por unidade</h2><div class="scroll"><table id="tU"></table></div></div>
    <div class="card col-6"><h2>Receitas por categoria</h2><div class="chart-box"><canvas id="cR"></canvas></div></div>
    <div class="card col-6"><h2>Despesas por categoria</h2><div class="chart-box"><canvas id="cD"></canvas></div></div>
    ${d.agf ? '<div class="card col-12"><h2>Gestão 100% / Grupo 40%</h2><div id="agfBox"></div></div>' : ""}
  </div>`);
  view.append(grid);

  const sm = d.serieMensal, nM = mesesComDados(sm);
  chart("cM", lineBarCfg(sm.meses.slice(0,nM), [
    bar("Faturamento", sm.entrada.slice(0,nM), "#4cc2ff"),
    bar("Despesa", sm.saida.slice(0,nM), "#f85149"),
    line("Resultado", sm.resultado.slice(0,nM), "#3fb950"),
  ]));
  $("#tU").innerHTML = `<thead><tr><th>Unidade</th><th>Fat.</th><th>Desp.</th></tr></thead><tbody>${
    d.porUnidade.map((u) => `<tr><td>${u.nome}</td><td>${BRL(u.faturamento)}</td><td>${BRL(u.despesa)}</td></tr>`).join("") || '<tr><td colspan=3 class="sub">sem dados</td></tr>'}</tbody>`;
  const rc = d.porCategoriaReceita.filter((c) => c.total > 0), dc = d.porCategoriaDespesa.filter((c) => c.total > 0);
  chart("cR", doughnutCfg(rc.map((c) => c.nome), rc.map((c) => c.total)));
  chart("cD", doughnutCfg(dc.map((c) => c.nome), dc.map((c) => c.total)));
  if (d.agf) renderAgf($("#agfBox"), d.agf);
}

/* ====================== LANÇAMENTOS ====================== */
async function viewLancamentos() {
  setActive("lancamentos");
  const view = $("#view"); view.innerHTML = "";
  const anos = (await api("/api/dashboard")).anos;
  view.append(el(`<div class="topbar"><div><h1>Lançamentos</h1><div class="sub">Entradas, saídas e transferências</div></div></div>`));

  const tb = el(`<div class="toolbar"></div>`);
  const fEmp = el(`<label class="fld">Empresa<select id="fEmp"><option value="">Todas</option>${STATE.empresas.filter((e)=>e.tipo!=='grupo').map((e)=>`<option value="${e.id}">${e.nome}</option>`).join("")}</select></label>`);
  const fAno = el(`<label class="fld">Ano<select id="fAno"><option value="">Todos</option>${anos.map((a)=>`<option>${a}</option>`).join("")}</select></label>`);
  const fTipo = el(`<label class="fld">Tipo<select id="fTipo"><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="transferencia">Transferência</option></select></label>`);
  const fQ = el(`<label class="fld">Busca<input id="fQ" placeholder="descrição…"></label>`);
  const btnE = el(`<button class="btn green">+ Entrada</button>`);
  const btnS = el(`<button class="btn red" style="border-color:var(--red)">+ Saída</button>`);
  const btnT = el(`<button class="btn">⇄ Transferência</button>`);
  tb.append(fEmp, fAno, fTipo, fQ, btnE, btnS, btnT);
  view.append(tb);
  const tableCard = el(`<div class="card"><div class="scroll"><table id="tLanc"></table></div></div>`);
  view.append(tableCard);

  async function load() {
    const p = new URLSearchParams();
    if ($("#fEmp").value) p.set("empresa_id", $("#fEmp").value);
    if ($("#fAno").value) p.set("ano", $("#fAno").value);
    if ($("#fTipo").value) p.set("tipo", $("#fTipo").value);
    if ($("#fQ").value) p.set("q", $("#fQ").value);
    const rows = await api("/api/lancamentos?" + p.toString());
    $("#tLanc").innerHTML = `<thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Origem</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${(r.data_competencia||"").split("-").reverse().join("/")}</td>
        <td>${r.empresa_nome}</td>
        <td>${r.descricao||""}</td>
        <td>${r.categoria_nome||"—"}</td>
        <td><span class="pill ${r.tipo==='entrada'?'green':r.tipo==='saida'?'red':''}">${r.tipo}</span></td>
        <td class="${r.tipo==='entrada'?'pos':r.tipo==='saida'?'neg':''}">${BRL2(r.valor_liquido)}</td>
        <td><span class="pill">${r.origem}</span></td>
        <td><button class="btn sm" data-edit="${r.id}">✎</button> <button class="btn sm red" data-del="${r.id}">🗑</button></td>
      </tr>`).join("") || '<tr><td colspan=8 class="sub">Nenhum lançamento.</td></tr>'}</tbody>`;
    $("#tLanc").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      const r = rows.find((x) => x.id == b.dataset.edit); openLancModal(r, load);
    }));
    $("#tLanc").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (confirm("Excluir este lançamento?")) { await fetch("/api/lancamentos/" + b.dataset.del, { method: "DELETE" }); load(); }
    }));
  }
  [fEmp, fAno, fTipo].forEach((f) => f.querySelector("select").addEventListener("change", load));
  fQ.querySelector("input").addEventListener("input", () => { clearTimeout(window._t); window._t = setTimeout(load, 300); });
  btnE.addEventListener("click", () => openLancModal({ tipo: "entrada" }, load));
  btnS.addEventListener("click", () => openLancModal({ tipo: "saida" }, load));
  btnT.addEventListener("click", () => openLancModal({ tipo: "transferencia" }, load));
  load();
}

/* ----- Modal de lançamento ----- */
function openLancModal(data, onSaved) {
  const isEdit = !!data.id;
  const optEmp = STATE.empresas.filter((e)=>e.tipo!=='grupo').map((e)=>`<option value="${e.id}" ${data.empresa_id==e.id?"selected":""}>${e.nome}</option>`).join("");
  const optCat = (tipo) => STATE.categorias.filter((c)=>c.tipo===tipo).map((c)=>`<option value="${c.id}" ${data.categoria_id==c.id?"selected":""}>${c.nome}</option>`).join("");
  const optConta = (sel) => STATE.contas.map((c)=>`<option value="${c.id}" ${sel==c.id?"selected":""}>${c.nome}</option>`).join("");
  const optCC = STATE.centros.map((c)=>`<option value="${c.id}" ${data.centro_custo_id==c.id?"selected":""}>${c.nome}</option>`).join("");
  const optPessoa = STATE.pessoas.map((p)=>`<option value="${p.id}" ${data.pessoa_id==p.id?"selected":""}>${p.nome}</option>`).join("");
  const optUni = (empId) => STATE.unidades.filter((u)=>u.empresa_id==empId).map((u)=>`<option value="${u.id}" ${data.unidade_id==u.id?"selected":""}>${u.nome}</option>`).join("");
  const tipo = data.tipo || "entrada";
  const hoje = data.data_competencia || new Date().toISOString().slice(0,10);
  const root = $("#modal-root");
  const title = isEdit ? "Editar lançamento" : (tipo==="entrada"?"Nova entrada":tipo==="saida"?"Nova saída":"Transferência");
  root.innerHTML = `<div class="modal-bg"><div class="modal">
    <h3>${title}</h3>
    <div class="form-grid">
      <label class="fld">Tipo<select id="mTipo">
        <option value="entrada" ${tipo==='entrada'?'selected':''}>Entrada</option>
        <option value="saida" ${tipo==='saida'?'selected':''}>Saída</option>
        <option value="transferencia" ${tipo==='transferencia'?'selected':''}>Transferência</option></select></label>
      <label class="fld">Empresa<select id="mEmp">${optEmp}</select></label>
      <label class="fld full">Descrição<input id="mDesc" value="${(data.descricao||"").replace(/"/g,'&quot;')}"></label>
      <label class="fld" id="wCat">Categoria<select id="mCat">${optCat(tipo)}</select></label>
      <label class="fld" id="wUni">Unidade<select id="mUni"><option value="">—</option>${optUni(data.empresa_id)}</select></label>
      <label class="fld" id="wCC">Centro de custo<select id="mCC"><option value="">—</option>${optCC}</select></label>
      <label class="fld" id="wPessoa">Cliente / Fornecedor<select id="mPessoa"><option value="">—</option>${optPessoa}</select></label>
      <label class="fld" id="wConta">Conta${tipo==='transferencia'?' (origem)':''}<select id="mConta"><option value="">—</option>${optConta(data.conta_id)}</select></label>
      <label class="fld" id="wContaDest" style="display:${tipo==='transferencia'?'flex':'none'}">Conta destino<select id="mContaDest"><option value="">—</option>${optConta(data.conta_destino_id)}</select></label>
      <label class="fld">Valor (R$)<input id="mValor" type="number" step="0.01" value="${data.valor_liquido||""}"></label>
      <label class="fld">Data competência<input id="mData" type="date" value="${hoje}"></label>
      <label class="fld">Vencimento<input id="mVenc" type="date" value="${data.data_vencimento||""}"></label>
      <label class="fld">Status<select id="mStatus">
        <option value="confirmado" ${data.status==='confirmado'?'selected':''}>Confirmado</option>
        <option value="pendente" ${data.status==='pendente'?'selected':''}>Pendente</option>
        <option value="pago" ${data.status==='pago'?'selected':''}>Pago</option>
        <option value="recebido" ${data.status==='recebido'?'selected':''}>Recebido</option>
        <option value="atrasado" ${data.status==='atrasado'?'selected':''}>Atrasado</option></select></label>
      <label class="fld full">Observações<input id="mObs" value="${(data.observacoes||"").replace(/"/g,'&quot;')}"></label>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancelar</button>
      <button class="btn primary" id="mSave">${isEdit?"Salvar":"Adicionar"}</button>
    </div>
  </div></div>`;
  const close = () => (root.innerHTML = "");
  const aplicaTipo = () => {
    const t = $("#mTipo").value;
    $("#mCat").innerHTML = optCat(t);
    const transf = t === "transferencia";
    $("#wCat").style.display = transf ? "none" : "flex";
    $("#wPessoa").style.display = transf ? "none" : "flex";
    $("#wContaDest").style.display = transf ? "flex" : "none";
    $("#wConta").firstChild.textContent = "Conta" + (transf ? " (origem)" : "");
  };
  $("#mCancel").addEventListener("click", close);
  $("#mTipo").addEventListener("change", aplicaTipo);
  $("#mEmp").addEventListener("change", () => { $("#mUni").innerHTML = `<option value="">—</option>` + optUni($("#mEmp").value); });
  aplicaTipo();
  $("#mSave").addEventListener("click", async () => {
    const t = $("#mTipo").value;
    const body = {
      tipo: t, empresa_id: Number($("#mEmp").value), descricao: $("#mDesc").value,
      categoria_id: t === "transferencia" ? null : ($("#mCat").value || null),
      unidade_id: $("#mUni").value || null, centro_custo_id: $("#mCC").value || null,
      pessoa_id: t === "transferencia" ? null : ($("#mPessoa").value || null),
      conta_id: $("#mConta").value || null, conta_destino_id: t === "transferencia" ? ($("#mContaDest").value || null) : null,
      valor_liquido: Number($("#mValor").value), data_competencia: $("#mData").value,
      data_vencimento: $("#mVenc").value || null, status: $("#mStatus").value, observacoes: $("#mObs").value,
    };
    if (!body.empresa_id || !body.valor_liquido || !body.data_competencia) { alert("Preencha empresa, valor e data."); return; }
    if (t === "transferencia" && (!body.conta_id || !body.conta_destino_id)) { alert("Transferência exige conta de origem e destino."); return; }
    if (isEdit) await fetch("/api/lancamentos/" + data.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    else await fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    close(); onSaved && onSaved();
  });
}

/* ====================== CAIXA E BANCOS ====================== */
async function viewCaixa() {
  setActive("caixa");
  const view = $("#view"); view.innerHTML = "Carregando…";
  const saldos = await api("/api/contas/saldos");
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Caixa e Bancos</h1><div class="sub">Saldos por conta e movimentações</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px"></div>`);
  const bTransf = el(`<button class="btn">⇄ Transferência</button>`);
  const bNova = el(`<button class="btn primary">+ Conta</button>`);
  right.append(bTransf, bNova); top.append(right); view.append(top);
  bTransf.addEventListener("click", () => openLancModal({ tipo: "transferencia" }, viewCaixa));
  bNova.addEventListener("click", () => openContaModal(null, viewCaixa));

  const totalCaixa = saldos.reduce((s, c) => s + (c.saldo || 0), 0);
  view.append(el(`<div class="kpis">${kpi("Saldo total (contas ativas)", BRL(totalCaixa), saldos.length + " contas")}</div>`));

  const cards = el(`<div class="grid"></div>`);
  for (const c of saldos) {
    const card = el(`<div class="card col-4">
      <h2>${c.nome} ${c.banco ? `<span class="pill">${c.banco}</span>` : ""}</h2>
      <div class="kpi" style="border:none;padding:0">
        <div class="val ${c.saldo>=0?'pos':'neg'}">${BRL2(c.saldo)}</div>
        <div class="sub">${c.empresa_nome || "—"} · ${c.movimentos} mov. · inicial ${BRL(c.saldo_inicial)}</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn sm" data-extrato="${c.id}">Extrato</button>
        <button class="btn sm" data-edit="${c.id}">Editar</button>
      </div></div>`);
    cards.append(card);
  }
  view.append(cards);
  cards.querySelectorAll("[data-extrato]").forEach((b) => b.addEventListener("click", () => openExtrato(b.dataset.extrato, saldos.find((x) => x.id == b.dataset.extrato))));
  cards.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openContaModal(saldos.find((x) => x.id == b.dataset.edit), viewCaixa)));
}

async function openExtrato(id, conta) {
  const rows = await api(`/api/contas/${id}/extrato`);
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:760px">
    <h3>Extrato — ${conta.nome}</h3>
    <div class="scroll"><table><thead><tr><th>Data</th><th>Empresa</th><th>Descrição</th><th>Mov.</th><th>Valor</th></tr></thead>
    <tbody>${rows.map((r) => {
      const entra = r.mov === "entrada" || r.mov === "entrada_transf";
      return `<tr><td>${(r.data_competencia||"").split("-").reverse().join("/")}</td><td>${r.empresa_nome}</td>
        <td>${r.descricao||""}</td><td><span class="pill ${entra?'green':'red'}">${r.mov.replace("_"," ")}</span></td>
        <td class="${entra?'pos':'neg'}">${entra?'+':'−'}${BRL2(r.valor_liquido)}</td></tr>`;
    }).join("") || '<tr><td colspan=5 class="sub">Sem movimentos.</td></tr>'}</tbody></table></div>
    <div class="modal-actions"><button class="btn" id="mClose">Fechar</button></div>
  </div></div>`;
  $("#mClose").addEventListener("click", () => (root.innerHTML = ""));
}

function openContaModal(data, onSaved) {
  data = data || {};
  const isEdit = !!data.id;
  const optEmp = `<option value="">(Grupo)</option>` + STATE.empresas.filter((e)=>e.tipo!=='grupo').map((e)=>`<option value="${e.id}" ${data.empresa_id==e.id?"selected":""}>${e.nome}</option>`).join("");
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal">
    <h3>${isEdit?"Editar conta":"Nova conta"}</h3>
    <div class="form-grid">
      <label class="fld full">Nome<input id="cNome" value="${(data.nome||"").replace(/"/g,'&quot;')}"></label>
      <label class="fld">Banco<input id="cBanco" value="${(data.banco||"").replace(/"/g,'&quot;')}"></label>
      <label class="fld">Tipo<select id="cTipo">
        <option value="caixa" ${data.tipo==='caixa'?'selected':''}>Caixa</option>
        <option value="conta_corrente" ${data.tipo==='conta_corrente'?'selected':''}>Conta corrente</option>
        <option value="aplicacao" ${data.tipo==='aplicacao'?'selected':''}>Aplicação</option></select></label>
      <label class="fld">Empresa<select id="cEmp">${optEmp}</select></label>
      <label class="fld">Saldo inicial (R$)<input id="cSaldo" type="number" step="0.01" value="${data.saldo_inicial||0}"></label>
    </div>
    <div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Salvar</button></div>
  </div></div>`;
  $("#mCancel").addEventListener("click", () => (root.innerHTML = ""));
  $("#mSave").addEventListener("click", async () => {
    const body = { nome: $("#cNome").value, banco: $("#cBanco").value, tipo: $("#cTipo").value,
      empresa_id: $("#cEmp").value || null, saldo_inicial: Number($("#cSaldo").value) };
    if (!body.nome) { alert("Informe o nome."); return; }
    if (isEdit) await fetch("/api/contas/" + data.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    else await fetch("/api/contas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    STATE.contas = await api("/api/contas");
    root.innerHTML = ""; onSaved && onSaved();
  });
}

/* ============ CONTAS A PAGAR / RECEBER ============ */
async function viewContasStatus(tipo) {
  const ehPagar = tipo === "saida";
  setActive(ehPagar ? "pagar" : "receber");
  const view = $("#view"); view.innerHTML = "Carregando…";
  // pendentes/atrasados do tipo, ordenados por vencimento
  const rows = (await api(`/api/lancamentos?tipo=${tipo}&origem=manual&limit=1000`))
    .filter((r) => ["pendente", "atrasado"].includes(r.status));
  view.innerHTML = "";
  const titulo = ehPagar ? "Contas a Pagar" : "Contas a Receber";
  const top = el(`<div class="topbar"><div><h1>${titulo}</h1><div class="sub">Lançamentos ${ehPagar?"a pagar":"a receber"} pendentes</div></div></div>`);
  const bNovo = el(`<button class="btn ${ehPagar?'red':'green'}" style="${ehPagar?'border-color:var(--red)':''}">+ ${ehPagar?'Conta a pagar':'Conta a receber'}</button>`);
  top.append(bNovo); view.append(top);
  bNovo.addEventListener("click", () => openLancModal({ tipo, status: "pendente" }, () => viewContasStatus(tipo)));

  const total = rows.reduce((s, r) => s + (r.valor_liquido || 0), 0);
  view.append(el(`<div class="kpis">${kpi("Total " + (ehPagar?"a pagar":"a receber"), BRL(total), rows.length + " títulos")}</div>`));

  const card = el(`<div class="card"><div class="scroll"><table id="t"></table></div></div>`);
  view.append(card);
  $("#t").innerHTML = `<thead><tr><th>Vencimento</th><th>Empresa</th><th>Descrição</th><th>${ehPagar?'Fornecedor':'Cliente'}</th><th>Valor</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${((r.data_vencimento||r.data_competencia)||"").split("-").reverse().join("/")}</td>
      <td>${r.empresa_nome}</td><td>${r.descricao||""}</td><td>${r.pessoa_nome||"—"}</td>
      <td class="${ehPagar?'neg':'pos'}">${BRL2(r.valor_liquido)}</td>
      <td><span class="pill ${r.status==='atrasado'?'red':'amber'}">${r.status}</span></td>
      <td><button class="btn sm green" data-baixar="${r.id}">${ehPagar?'Pagar':'Receber'}</button>
          <button class="btn sm" data-edit="${r.id}">✎</button></td></tr>`).join("")
      || `<tr><td colspan=7 class="sub">Nenhum título pendente.</td></tr>`}</tbody>`;
  $("#t").querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", async () => {
    await fetch(`/api/lancamentos/${b.dataset.baixar}/baixar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: ehPagar ? "pago" : "recebido" }) });
    viewContasStatus(tipo);
  }));
  $("#t").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openLancModal(rows.find((x) => x.id == b.dataset.edit), () => viewContasStatus(tipo))));
}

/* ====================== RELATÓRIOS ====================== */
async function viewRelatorios(ano) {
  setActive("relatorios");
  const view = $("#view"); view.innerHTML = "Carregando…";
  const d = await api("/api/dashboard" + (ano ? "?ano=" + ano : ""));
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Relatórios</h1><div class="sub">DRE por empresa, consolidado e evolução</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewRelatorios(a)));
  top.append(right); view.append(top);

  // DRE consolidado simples
  const k = d.kpis;
  view.append(el(`<div class="card" style="margin-bottom:18px"><h2>DRE Consolidado ${d.ano}</h2>
    <table>
      <tbody>
        <tr><td>(+) Receitas operacionais</td><td class="pos">${BRL2(k.faturamento)}</td></tr>
        <tr><td>(−) Custos e despesas</td><td class="neg">${BRL2(k.custo)}</td></tr>
        <tr class="total"><td>(=) Resultado operacional</td><td class="${k.resultadoOperacional>=0?'pos':'neg'}">${BRL2(k.resultadoOperacional)}</td></tr>
        <tr><td>(−) Distribuição familiar (compulsória)</td><td class="neg">${BRL2(k.distribuicaoFamiliar)}</td></tr>
        <tr class="total"><td>(=) Resultado após família</td><td class="${k.resultadoAposFamilia>=0?'pos':'neg'}">${BRL2(k.resultadoAposFamilia)}</td></tr>
      </tbody></table></div>`));

  // Resultado por empresa
  view.append(el(`<div class="card" style="margin-bottom:18px"><h2>Resultado por empresa ${d.ano}</h2>
    <table><thead><tr><th>Empresa</th><th>Receitas</th><th>Despesas</th><th>Resultado</th><th>Participação</th><th>Atribuível ao Grupo</th></tr></thead>
    <tbody>${d.porEmpresa.map((e)=>`<tr><td>${e.nome}</td><td>${BRL(e.faturamento)}</td><td>${BRL(e.despesa)}</td>
      <td class="${e.resultado>=0?'pos':'neg'}">${BRL(e.resultado)}</td><td>${e.part}%</td>
      <td>${BRL(e.resultado*e.part/100)}</td></tr>`).join("")}</tbody></table></div>`));

  // Evolução anual
  const evCard = el(`<div class="card"><h2>Evolução anual</h2><div class="scroll"><table>
    <thead><tr><th>Ano</th><th>Faturamento</th><th>Custo</th><th>Resultado</th><th>Recebimentos</th><th>Pagamentos</th></tr></thead>
    <tbody>${d.evolucaoAnual.map((r)=>`<tr><td>${r.ano}</td><td>${BRL(r.faturamento_total)}</td><td>${BRL(r.custo_total)}</td>
      <td class="${r.resultado>=0?'pos':'neg'}">${BRL(r.resultado)}</td><td>${BRL(r.recebimentos)}</td><td>${BRL(r.pagamentos)}</td></tr>`).join("")}</tbody>
    </table></div></div>`);
  view.append(evCard);
}

/* ====================== CADASTROS ====================== */
async function viewCadastros() {
  setActive("cadastros");
  const view = $("#view"); view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Cadastros</h1><div class="sub">Estrutura do sistema</div></div></div>`);
  const acts = el(`<div style="display:flex;gap:8px;flex-wrap:wrap"></div>`);
  const bConta = el(`<button class="btn">+ Conta</button>`);
  const bCat = el(`<button class="btn">+ Categoria</button>`);
  const bCentro = el(`<button class="btn">+ Centro de custo</button>`);
  const bPessoa = el(`<button class="btn">+ Pessoa</button>`);
  acts.append(bConta, bCat, bCentro, bPessoa); top.append(acts); view.append(top);
  bConta.addEventListener("click", () => openContaModal(null, viewCadastros));
  bCat.addEventListener("click", () => openSimpleModal("Nova categoria", [
    { id: "nome", label: "Nome" },
    { id: "tipo", label: "Tipo", type: "select", options: [["receita","Receita"],["despesa","Despesa"],["transferencia","Transferência"]] },
  ], async (v) => { await postJSON("/api/categorias", v); STATE.categorias = await api("/api/categorias"); viewCadastros(); }));
  bCentro.addEventListener("click", () => openSimpleModal("Novo centro de custo", [{ id: "nome", label: "Nome" }],
    async (v) => { await postJSON("/api/centros-custo", v); STATE.centros = await api("/api/centros-custo"); viewCadastros(); }));
  bPessoa.addEventListener("click", () => openSimpleModal("Nova pessoa", [
    { id: "nome", label: "Nome" },
    { id: "tipo", label: "Tipo", type: "select", options: [["cliente","Cliente"],["fornecedor","Fornecedor"],["colaborador","Colaborador"],["socio","Sócio"],["familiar","Familiar"],["parceiro","Parceiro"]] },
    { id: "cpf_cnpj", label: "CPF / CNPJ" }, { id: "telefone", label: "Telefone" }, { id: "email", label: "E-mail" },
  ], async (v) => { await postJSON("/api/pessoas", v); STATE.pessoas = await api("/api/pessoas"); viewCadastros(); }));

  const unidades = STATE.unidades;
  const tbl = (titulo, head, rows) => `<div class="card" style="margin-bottom:18px"><h2>${titulo}</h2>
    <div class="scroll"><table><thead><tr>${head.map((h)=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  view.append(el(tbl("Empresas / Frentes", ["Nome","Tipo","Participação","Consolida"],
    STATE.empresas.map((e)=>`<tr><td>${e.nome}</td><td>${e.tipo}</td><td>${e.percentual_participacao}%</td><td>${e.consolida?"Sim":"Não"}</td></tr>`).join(""))));
  view.append(el(tbl("Unidades", ["Empresa","Unidade","Tipo"],
    unidades.map((u)=>{const e=STATE.empresas.find((x)=>x.id===u.empresa_id);return `<tr><td>${e?e.nome:""}</td><td>${u.nome}</td><td>${u.tipo||""}</td></tr>`}).join(""))));
  view.append(el(tbl("Contas financeiras", ["Conta","Banco","Tipo"],
    STATE.contas.map((c)=>`<tr><td>${c.nome}</td><td>${c.banco||""}</td><td>${c.tipo||""}</td></tr>`).join(""))));
  view.append(el(tbl("Categorias", ["Categoria","Tipo"],
    STATE.categorias.map((c)=>`<tr><td>${c.nome}</td><td>${c.tipo}</td></tr>`).join(""))));
  view.append(el(tbl("Centros de custo", ["Nome"], STATE.centros.map((c)=>`<tr><td>${c.nome}</td></tr>`).join(""))));
  view.append(el(tbl("Pessoas (clientes / fornecedores)", ["Nome","Tipo","CPF/CNPJ","Telefone"],
    STATE.pessoas.map((p)=>`<tr><td>${p.nome}</td><td>${p.tipo||""}</td><td>${p.cpf_cnpj||""}</td><td>${p.telefone||""}</td></tr>`).join("")
    || `<tr><td colspan=4 class="sub">Nenhuma pessoa cadastrada.</td></tr>`)));
}

/* Modal genérico simples (lista de campos -> objeto) */
function openSimpleModal(titulo, campos, onSave) {
  const root = $("#modal-root");
  const field = (f) => f.type === "select"
    ? `<label class="fld full">${f.label}<select id="f_${f.id}">${f.options.map((o)=>`<option value="${o[0]}">${o[1]}</option>`).join("")}</select></label>`
    : `<label class="fld full">${f.label}<input id="f_${f.id}"></label>`;
  root.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:440px">
    <h3>${titulo}</h3><div class="form-grid">${campos.map(field).join("")}</div>
    <div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Salvar</button></div>
  </div></div>`;
  $("#mCancel").addEventListener("click", () => (root.innerHTML = ""));
  $("#mSave").addEventListener("click", async () => {
    const v = {}; campos.forEach((f) => (v[f.id] = $("#f_" + f.id).value));
    if (!v[campos[0].id]) { alert("Preencha " + campos[0].label); return; }
    await onSave(v); root.innerHTML = "";
  });
}
function postJSON(url, body) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()); }

/* ====================== helpers de UI/charts ====================== */
function kpi(lbl, val, sub = "", cls = "") { return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div>${sub?`<div class="sub">${sub}</div>`:""}</div>`; }
function mesesComDados(sm) { let n = 0; for (let i = 0; i < 12; i++) if (sm.entrada[i] || sm.saida[i]) n = i + 1; return n || 12; }
function bar(label, data, color) { return { type: "bar", label, data, backgroundColor: color }; }
function line(label, data, color) { return { type: "line", label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: .3 }; }
function lineBarCfg(labels, datasets) {
  return { data: { labels, datasets }, options: { maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${BRL2(c.parsed.y)}` } } },
    scales: { y: { ticks: { callback: (v) => BRL(v) } } } } };
}
function doughnutCfg(labels, data) {
  return { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: PALETTE }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.label}: ${BRL(c.parsed)}` } } } } };
}

boot();
