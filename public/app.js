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
  wireMenu();
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/consolidado/dashboard";
  route();
}

function wireMenu() {
  const app = document.getElementById("app");
  const tgl = document.getElementById("menuToggle");
  const ov = document.getElementById("overlay");
  if (tgl) tgl.addEventListener("click", () => app.classList.toggle("nav-open"));
  if (ov) ov.addEventListener("click", () => app.classList.remove("nav-open"));
}
function closeDrawer() { const a = document.getElementById("app"); if (a) a.classList.remove("nav-open"); }

function toast(msg, tipo = "ok") {
  const box = document.getElementById("toasts"); if (!box) return;
  const icon = tipo === "err" ? "✕" : tipo === "info" ? "ℹ" : "✓";
  const t = el(`<div class="toast ${tipo}"><span class="toast__icon">${icon}</span><span>${msg}</span><button class="toast__close" aria-label="Fechar">×</button></div>`);
  box.appendChild(t);
  const remove = () => { t.style.opacity = "0"; setTimeout(() => t.remove(), 220); };
  t.querySelector(".toast__close").addEventListener("click", remove);
  setTimeout(remove, 4000);
}

/* Modal de confirmação estilizado (Promise<boolean>) */
function confirmar(msg, { ok = "Excluir", cancel = "Cancelar", perigo = true } = {}) {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    const prevFocus = document.activeElement;
    root.innerHTML = `<div class="modal-bg" id="cfBg"><div class="modal" role="alertdialog" aria-modal="true" style="max-width:420px">
      <h3>Tem certeza?</h3>
      <p style="color:var(--muted);margin:0">${msg}</p>
      <div class="modal-actions"><button class="btn" id="cfN">${cancel}</button><button class="btn ${perigo ? "danger" : "primary"}" id="cfY">${ok}</button></div>
    </div></div>`;
    const yes = $("#cfY"), no = $("#cfN");
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === yes ? no : yes).focus(); }
    };
    const close = (v) => { document.removeEventListener("keydown", onKey); root.innerHTML = ""; if (prevFocus && prevFocus.focus) prevFocus.focus(); resolve(v); };
    no.addEventListener("click", () => close(false));
    yes.addEventListener("click", () => close(true));
    $("#cfBg").addEventListener("click", (e) => { if (e.target.id === "cfBg") close(false); });
    document.addEventListener("keydown", onKey);
    yes.focus();
  });
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

const SECOES = [
  ["dashboard", "Dashboard", "📈"],
  ["lancamentos", "Lançamentos", "💸"],
  ["recorrentes", "Recorrentes", "🔁"],
  ["caixa", "Caixa e Bancos", "🏦"],
  ["pagar", "Contas a Pagar", "📕"],
  ["receber", "Contas a Receber", "📗"],
  ["relatorios", "Relatórios", "📑"],
];
const isAdminUI = () => STATE.usuario && STATE.usuario.perfil === "admin";

function renderNav() {
  const empresasHtml = STATE.empresas.filter((e) => e.tipo !== "grupo").map((e) => {
    const open = false; // todos os grupos começam fechados (inclusive o da página atual)
    const subs = SECOES.map((s) => `<a href="#/empresa/${e.id}/${s[0]}" data-route="empresa/${e.id}/${s[0]}">${s[2]} ${s[1]}</a>`).join("");
    return `<div class="nav-emp">
      <div class="nav-emp-head ${open ? "open" : ""}" data-emp="${e.id}"><span class="dot" style="background:${e.cor || "#888"}"></span><span class="nm">${e.nome}</span><span class="caret">${open ? "▾" : "▸"}</span></div>
      <div class="nav-emp-sub" data-sub="${e.id}" style="display:${open ? "block" : "none"}">${subs}</div>
    </div>`;
  }).join("");
  const admin = isAdminUI();
  $("#nav").innerHTML = `
    ${admin ? `<div class="nav-group">Grupo RICCI</div>
    <a href="#/consolidado/dashboard" data-route="consolidado/dashboard">🏠 Dashboard Consolidado</a>
    <a href="#/consolidado/relatorios" data-route="consolidado/relatorios">📊 Relatórios do Grupo</a>` : ""}
    <div class="nav-group">Empresas / Frentes</div>
    ${empresasHtml || '<div class="nav-group" style="color:var(--text-faint)">nenhuma empresa atribuída</div>'}
    ${admin ? `<div class="nav-group">Administração</div>
    <a href="#/importar" data-route="importar">📥 Importar planilha</a>
    <a href="#/cadastros" data-route="cadastros">⚙️ Cadastros</a>` : ""}
    <div class="nav-group">${STATE.usuario ? STATE.usuario.nome : ""}${admin ? " · admin" : ""}</div>
    <a href="#" id="navLogout">🚪 Sair</a>
  `;
  document.querySelectorAll(".nav-emp-head").forEach((hd) => hd.addEventListener("click", () => {
    const sub = document.querySelector(`[data-sub="${hd.dataset.emp}"]`);
    const vis = sub.style.display !== "none";
    // accordion exclusivo: fecha todos os grupos antes de abrir o clicado
    document.querySelectorAll(".nav-emp-sub").forEach((s) => (s.style.display = "none"));
    document.querySelectorAll(".nav-emp-head").forEach((h) => {
      h.classList.remove("open");
      const c = h.querySelector(".caret"); if (c) c.textContent = "▸";
    });
    if (!vis) { // estava fechado → abre só este; se estava aberto, permanece fechado (toggle)
      sub.style.display = "block";
      hd.classList.add("open");
      hd.querySelector(".caret").textContent = "▾";
    }
  }));
  const lo = document.getElementById("navLogout");
  if (lo) lo.addEventListener("click", (e) => { e.preventDefault(); logout(); });
}
function setActive(route) {
  document.querySelectorAll("#nav a").forEach((a) => {
    const on = a.dataset.route === route;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function route() {
  const h = location.hash.replace(/^#\//, "") || "consolidado/dashboard";
  clearCharts();
  closeDrawer();
  renderNav();
  // não-admin não acessa consolidado / cadastros / importar
  if (!isAdminUI() && (h.startsWith("consolidado") || h === "cadastros" || h === "importar")) {
    const primeira = STATE.empresas.find((e) => e.tipo !== "grupo");
    if (primeira) { location.hash = `#/empresa/${primeira.id}/dashboard`; return; }
    $("#view").innerHTML = `<div class="empty"><div class="ic">🔒</div>Você ainda não tem empresas atribuídas. Peça a um administrador.</div>`;
    return;
  }
  setActive(h);
  const p = h.split("/");
  if (p[0] === "consolidado") {
    if (p[1] === "relatorios") return viewRelatorios(null);
    return viewConsolidado();
  }
  if (p[0] === "empresa") {
    const id = Number(p[1]); const sec = p[2] || "dashboard";
    if (sec === "lancamentos") return viewLancamentos(id);
    if (sec === "recorrentes") return viewRecorrentes(id);
    if (sec === "caixa") return viewCaixa(id);
    if (sec === "pagar") return viewContasStatus("saida", id);
    if (sec === "receber") return viewContasStatus("entrada", id);
    if (sec === "relatorios") return viewRelatorios(id);
    return viewEmpresa(id);
  }
  if (h === "cadastros") return viewCadastros();
  if (h === "importar") return viewImportar();
  viewConsolidado();
}

function anoSelector(anos, anoAtual, onChange) {
  const sel = el(`<select>${anos.map((a) => `<option ${a == anoAtual ? "selected" : ""}>${a}</option>`).join("")}</select>`);
  sel.addEventListener("change", () => onChange(Number(sel.value)));
  return sel;
}

/* ====================== DASHBOARD CONSOLIDADO ====================== */
async function viewConsolidado(ano) {
  clearCharts();
  const view = $("#view");
  view.innerHTML = skeletonDash();
  const d = await api("/api/dashboard" + (ano ? "?ano=" + ano : ""));
  STATE.anoSel = d.ano;
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Dashboard Consolidado — Grupo RICCI</h1>
    <div class="sub">Visão consolidada de todas as frentes · ${d.kpis.faturamento ? "" : "sem dados no ano"}</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewConsolidado(a)),
    el(`<button class="btn primary" id="btnNovoLanc">+ Lançamento</button>`));
  top.append(right);
  view.append(top);
  right.querySelector("#btnNovoLanc").addEventListener("click", () => openLancModal({}, () => viewConsolidado(d.ano)));

  view.append(el(`<div class="note">Consolidado operacional exclui <b>Família</b> (distribuição compulsória).
    A <b>Agência dos Correios</b> aparece pelos valores que entram no Grupo; a visão 100%/40% está no card da Agência abaixo e na página da empresa.</div>`));

  const k = d.kpis, a = d.anterior || {};
  const heroCls = k.resultadoAposFamilia >= 0 ? "pos" : "neg";
  view.append(el(`<div class="kpis">
    ${kpi("Resultado após família", BRL(k.resultadoAposFamilia), k.resultadoAposFamilia >= 0 ? "superávit do grupo" : "déficit do grupo", heroCls, true, trendPill(k.resultadoOperacional, a.resultadoOperacional, false, a.ano), `Resultado operacional menos a distribuição familiar.\nResultado operacional: ${BRL2(k.resultadoOperacional)}\n(−) Família: ${BRL2(k.distribuicaoFamiliar)}`)}
    ${kpi("Faturamento", BRL(k.faturamento), "entradas consolidadas", "info", false, trendPill(k.faturamento, a.faturamento, false, a.ano), `Entradas de todas as frentes (exceto Família) em ${d.ano}.\n${a.ano}: ${BRL2(a.faturamento || 0)}`)}
    ${kpi("Custo / Despesa", BRL(k.custo), "saídas operacionais", "neg", false, trendPill(k.custo, a.custo, true, a.ano), `Saídas operacionais consolidadas em ${d.ano}.\nNão inclui a distribuição familiar.\n${a.ano}: ${BRL2(a.custo || 0)}`)}
    ${kpi("Resultado operacional", BRL(k.resultadoOperacional), k.resultadoOperacional >= 0 ? "superávit" : "déficit", k.resultadoOperacional >= 0 ? "pos" : "neg", false, "", `Faturamento − Custo (antes da família).`)}
    ${kpi("Distribuição familiar", BRL(k.distribuicaoFamiliar), "retiradas (compulsória)", "info", false, "", `Retiradas da Família — distribuição compulsória que antecede o lucro.`)}
  </div>`));

  const mf = d.mesesFechados;
  if (mf && mf.parcial) {
    view.append(el(`<div class="mfechados">
      <div class="mf-tag">📅 Meses fechados · ${mf.rotulo}</div>
      <div class="mf-nums">
        <span>Faturamento <b>${BRL2(mf.faturamento)}</b></span>
        <span>Custo <b>${BRL2(mf.custo)}</b></span>
        <span>Resultado operacional <b class="${mf.resultadoOperacional >= 0 ? "pos" : "neg"}">${BRL2(mf.resultadoOperacional)}</b></span>
        <span>Após família <b class="${mf.resultadoAposFamilia >= 0 ? "pos" : "neg"}">${BRL2(mf.resultadoAposFamilia)}</b></span>
      </div>
      <div class="sub">Compara receita e custo no <b>mesmo período</b>, excluindo o mês corrente em andamento. Os cartões acima somam o ano inteiro — em que o custo já corre meses à frente da receita lançada, fazendo o resultado parecer pior do que é.</div>
    </div>`));
  }

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
      <td><a href="#/empresa/${e.id}/dashboard">${e.nome}</a> ${e.consolida ? "" : '<span class="pill amber">não consolida</span>'}</td>
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
  if (!agf || !agf.cem) { box.innerHTML = `<div class="empty"><div class="ic">🏤</div>Visão 100%/40% indisponível: a planilha da AGF não está no servidor.<br><span class="sub">Os valores que entram no Grupo continuam nos lançamentos da Agência.</span></div>`; return; }
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
  clearCharts();
  const view = $("#view"); view.innerHTML = skeletonDash();
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
  const a = d.anterior || {};
  view.append(el(`<div class="kpis">
    ${kpi("Resultado", BRL(k.resultado), k.resultado >= 0 ? "superávit" : "déficit", k.resultado >= 0 ? "pos" : "neg", true, trendPill(k.resultado, a.resultado, false, a.ano))}
    ${kpi("Faturamento", BRL(k.faturamento), "entradas", "info", false, trendPill(k.faturamento, a.faturamento, false, a.ano))}
    ${kpi("Despesa", BRL(k.despesa), "saídas", "neg", false, trendPill(k.despesa, a.despesa, true, a.ano))}
    ${e.percentual_participacao < 100 ? kpi(`Atribuível ao Grupo (${e.percentual_participacao}%)`, BRL(k.resultadoAtribuivel), "participação", "pos") : ""}
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
async function viewLancamentos(empresaId) {
  const view = $("#view"); view.innerHTML = "";
  const emp = STATE.empresas.find((e) => e.id === empresaId);
  const anos = (await api("/api/dashboard")).anos;
  view.append(el(`<div class="topbar"><div><h1>Lançamentos — ${emp ? emp.nome : ""}</h1><div class="sub">Entradas, saídas e transferências desta empresa</div></div></div>`));

  const tb = el(`<div class="toolbar"></div>`);
  const fAno = el(`<label class="fld">Ano<select id="fAno"><option value="">Todos</option>${anos.map((a)=>`<option>${a}</option>`).join("")}</select></label>`);
  const fTipo = el(`<label class="fld">Tipo<select id="fTipo"><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="transferencia">Transferência</option></select></label>`);
  const fQ = el(`<label class="fld">Busca<input id="fQ" placeholder="descrição…"></label>`);
  const btnE = el(`<button class="btn green">+ Entrada</button>`);
  const btnS = el(`<button class="btn red" style="border-color:var(--red)">+ Saída</button>`);
  const btnT = el(`<button class="btn">⇄ Transferência</button>`);
  tb.append(fAno, fTipo, fQ, btnE, btnS, btnT);
  view.append(tb);
  const tableCard = el(`<div class="card"><div class="scroll"><table id="tLanc" class="acts"></table></div></div>`);
  view.append(tableCard);
  const pager = el(`<div class="pager"><span class="pager__info" id="pgInfo"></span><div class="pager__controls"><button class="btn sm" id="pgPrev">‹ Anterior</button><button class="btn sm" id="pgNext">Próxima ›</button></div></div>`);
  view.append(pager);

  let rows = [];
  const st = { key: "data_competencia", dir: "desc", page: 1, perPage: 50 };

  async function load() {
    const p = new URLSearchParams();
    p.set("empresa_id", empresaId); p.set("limit", "5000");
    if ($("#fAno").value) p.set("ano", $("#fAno").value);
    if ($("#fTipo").value) p.set("tipo", $("#fTipo").value);
    if ($("#fQ").value) p.set("q", $("#fQ").value);
    rows = await api("/api/lancamentos?" + p.toString());
    st.page = 1; render();
  }
  function render() {
    const mul = st.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let x = a[st.key], y = b[st.key];
      if (st.key === "valor_liquido") return ((x || 0) - (y || 0)) * mul;
      return String(x || "").localeCompare(String(y || ""), "pt-BR") * mul;
    });
    const total = rows.reduce((s, r) => s + (r.tipo === "entrada" ? r.valor_liquido : r.tipo === "saida" ? -r.valor_liquido : 0), 0);
    const start = (st.page - 1) * st.perPage, end = Math.min(start + st.perPage, rows.length);
    const pageRows = rows.slice(start, end);
    const th = (k, lbl) => `<th class="sortable ${st.key === k ? (st.dir === "asc" ? "sort-asc" : "sort-desc") : ""}" data-key="${k}">${lbl} <span class="sort-ind"></span></th>`;
    $("#tLanc").innerHTML = `<thead><tr>
        ${th("data_competencia", "Data")}${th("empresa_nome", "Empresa")}${th("descricao", "Descrição")}${th("categoria_nome", "Categoria")}
        <th>Tipo</th>${th("valor_liquido", "Valor")}<th>Origem</th><th>Ações</th></tr></thead>
      <tbody>${pageRows.map((r) => `<tr>
        <td data-label="Data">${(r.data_competencia||"").split("-").reverse().join("/")}</td>
        <td data-label="Empresa">${r.empresa_nome}</td>
        <td data-label="Descrição">${r.descricao||""}</td>
        <td data-label="Categoria">${r.categoria_nome||"—"}</td>
        <td data-label="Tipo"><span class="pill ${r.tipo==='entrada'?'green':r.tipo==='saida'?'red':''}">${r.tipo}</span></td>
        <td data-label="Valor" class="${r.tipo==='entrada'?'pos':r.tipo==='saida'?'neg':''}">${BRL2(r.valor_liquido)}</td>
        <td data-label="Origem"><span class="pill">${r.origem}</span></td>
        <td data-label="Ações"><div class="row-actions"><button class="btn sm icon" aria-label="Editar lançamento" title="Editar" data-edit="${r.id}">✎</button><button class="btn sm icon red" aria-label="Excluir lançamento" title="Excluir" data-del="${r.id}">🗑</button></div></td>
      </tr>`).join("") || '<tr><td colspan=8><div class="empty"><div class="ic">💸</div>Nenhum lançamento encontrado.</div></td></tr>'}</tbody>
      ${rows.length ? `<tfoot><tr class="table-total"><td colspan="5">Total filtrado (líquido)</td><td class="${total>=0?'pos':'neg'}">${BRL2(total)}</td><td colspan="2"></td></tr></tfoot>` : ""}`;
    $("#pgInfo").textContent = `Mostrando ${rows.length ? start + 1 : 0}–${end} de ${rows.length}`;
    $("#pgPrev").disabled = st.page === 1;
    $("#pgNext").disabled = end >= rows.length;
    $("#tLanc").querySelectorAll(".sortable").forEach((h) => h.addEventListener("click", () => {
      const k = h.dataset.key; st.dir = (st.key === k && st.dir === "asc") ? "desc" : "asc"; st.key = k; render();
    }));
    $("#tLanc").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openLancModal(rows.find((x) => x.id == b.dataset.edit), load)));
    $("#tLanc").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmar("Excluir este lançamento? Esta ação não pode ser desfeita."))) return;
      const r = await fetch("/api/lancamentos/" + b.dataset.del, { method: "DELETE" }).then((x) => x.json());
      if (r.error) { toast(r.error, "err"); return; }
      toast("Lançamento excluído."); load();
    }));
  }
  $("#pgPrev").addEventListener("click", () => { if (st.page > 1) { st.page--; render(); } });
  $("#pgNext").addEventListener("click", () => { st.page++; render(); });
  [fAno, fTipo].forEach((f) => f.querySelector("select").addEventListener("change", load));
  fQ.querySelector("input").addEventListener("input", () => { clearTimeout(window._t); window._t = setTimeout(load, 300); });
  btnE.addEventListener("click", () => openLancModal({ tipo: "entrada", empresa_id: empresaId }, load));
  btnS.addEventListener("click", () => openLancModal({ tipo: "saida", empresa_id: empresaId }, load));
  btnT.addEventListener("click", () => openLancModal({ tipo: "transferencia", empresa_id: empresaId }, load));
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
    const resp = isEdit
      ? await fetch("/api/lancamentos/" + data.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json())
      : await fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    if (resp && resp.error) { alert(resp.error); return; }
    close(); toast(isEdit ? "Lançamento atualizado." : "Lançamento adicionado."); onSaved && onSaved();
  });
}

/* ====================== CAIXA E BANCOS ====================== */
async function viewCaixa(empresaId) {
  const view = $("#view"); view.innerHTML = "Carregando…";
  const emp = STATE.empresas.find((e) => e.id === empresaId);
  const saldos = await api("/api/contas/saldos?empresa_id=" + empresaId);
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Caixa e Bancos — ${emp ? emp.nome : ""}</h1><div class="sub">Saldos por conta e movimentações</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px"></div>`);
  const bTransf = el(`<button class="btn">⇄ Transferência</button>`);
  const bNova = el(`<button class="btn primary">+ Conta</button>`);
  right.append(bTransf, bNova); top.append(right); view.append(top);
  const refresh = () => viewCaixa(empresaId);
  bTransf.addEventListener("click", () => openLancModal({ tipo: "transferencia", empresa_id: empresaId }, refresh));
  bNova.addEventListener("click", () => openContaModal({ empresa_id: empresaId }, refresh));

  const totalCaixa = saldos.reduce((s, c) => s + (c.saldo || 0), 0);
  view.append(el(`<div class="kpis">${kpi("Saldo total (contas ativas)", BRL(totalCaixa), saldos.length + " contas", totalCaixa >= 0 ? "pos" : "neg", true)}</div>`));

  const bankIcon = (c) => {
    const t = (c.tipo || "") + " " + (c.nome || "") + " " + (c.banco || "");
    if (/caixa|dinheiro/i.test(t)) return "💵";
    if (/aplica/i.test(c.tipo || "")) return "📈";
    return "🏦";
  };
  const cards = el(`<div class="grid"></div>`);
  for (const c of saldos) {
    const card = el(`<div class="card col-4">
      <h2>${bankIcon(c)} ${c.nome} ${c.banco ? `<span class="pill">${c.banco}</span>` : ""}</h2>
      <div class="kpi" style="border:none;padding:0">
        <div class="val ${c.saldo>0?'pos':c.saldo<0?'neg':''}">${BRL2(c.saldo)}</div>
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
  cards.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openContaModal(saldos.find((x) => x.id == b.dataset.edit), refresh)));
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
async function viewContasStatus(tipo, empresaId) {
  const ehPagar = tipo === "saida";
  const view = $("#view"); view.innerHTML = "Carregando…";
  const emp = STATE.empresas.find((e) => e.id === empresaId);
  const refresh = () => viewContasStatus(tipo, empresaId);
  // pendentes/atrasados do tipo, ordenados por vencimento
  const rows = (await api(`/api/lancamentos?tipo=${tipo}&empresa_id=${empresaId}&limit=1000`))
    .filter((r) => ["pendente", "atrasado"].includes(r.status));
  view.innerHTML = "";
  const titulo = ehPagar ? "Contas a Pagar" : "Contas a Receber";
  const top = el(`<div class="topbar"><div><h1>${titulo} — ${emp ? emp.nome : ""}</h1><div class="sub">Lançamentos ${ehPagar?"a pagar":"a receber"} pendentes</div></div></div>`);
  const bNovo = el(`<button class="btn ${ehPagar?'red':'green'}" style="${ehPagar?'border-color:var(--red)':''}">+ ${ehPagar?'Conta a pagar':'Conta a receber'}</button>`);
  top.append(bNovo); view.append(top);
  bNovo.addEventListener("click", () => openLancModal({ tipo, status: "pendente", empresa_id: empresaId }, refresh));

  const total = rows.reduce((s, r) => s + (r.valor_liquido || 0), 0);
  view.append(el(`<div class="kpis">${kpi("Total " + (ehPagar?"a pagar":"a receber"), BRL(total), rows.length + " títulos")}</div>`));

  const card = el(`<div class="card"><div class="scroll"><table id="t" class="acts"></table></div></div>`);
  view.append(card);
  $("#t").innerHTML = `<thead><tr><th>Vencimento</th><th>Empresa</th><th>Descrição</th><th>${ehPagar?'Fornecedor':'Cliente'}</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${((r.data_vencimento||r.data_competencia)||"").split("-").reverse().join("/")}</td>
      <td>${r.empresa_nome}</td><td>${r.descricao||""}</td><td>${r.pessoa_nome||"—"}</td>
      <td class="${ehPagar?'neg':'pos'}">${BRL2(r.valor_liquido)}</td>
      <td><span class="pill ${r.status==='atrasado'?'red':'amber'}">${r.status}</span></td>
      <td><div class="row-actions"><button class="btn sm green" data-baixar="${r.id}">${ehPagar?'Pagar':'Receber'}</button>
          <button class="btn sm icon" aria-label="Editar título" title="Editar" data-edit="${r.id}">✎</button></div></td></tr>`).join("")
      || `<tr><td colspan=7><div class="empty"><div class="ic">${ehPagar?'📕':'📗'}</div>Nenhum título pendente.</div></td></tr>`}</tbody>`;
  $("#t").querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", async () => {
    await fetch(`/api/lancamentos/${b.dataset.baixar}/baixar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: ehPagar ? "pago" : "recebido" }) });
    refresh();
  }));
  $("#t").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openLancModal(rows.find((x) => x.id == b.dataset.edit), refresh)));
}

/* ====================== RECORRENTES ====================== */
async function viewRecorrentes(empresaId) {
  const view = $("#view"); view.innerHTML = "Carregando…";
  const emp = STATE.empresas.find((e) => e.id === empresaId);
  const recs = await api("/api/recorrencias?empresa_id=" + empresaId);
  view.innerHTML = "";
  const refresh = () => viewRecorrentes(empresaId);
  const now = new Date();
  const top = el(`<div class="topbar"><div><h1>Recorrentes — ${emp ? emp.nome : ""}</h1><div class="sub">Receitas/despesas fixas mensais</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"></div>`);
  const anos = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  right.append(
    el(`<label class="fld">Ano<select id="rAno">${anos.map((a) => `<option ${a === now.getFullYear() ? "selected" : ""}>${a}</option>`).join("")}</select></label>`),
    el(`<label class="fld">Mês<select id="rMes">${MES.map((m, i) => `<option value="${i + 1}" ${i === now.getMonth() ? "selected" : ""}>${m}</option>`).join("")}</select></label>`),
    el(`<button class="btn" id="bGerar">⚙ Gerar lançamentos do mês</button>`),
    el(`<button class="btn green" id="bNovaRec">+ Recorrência</button>`));
  top.append(right); view.append(top);
  right.querySelector("#bNovaRec").addEventListener("click", () => openRecorrenciaModal({ empresa_id: empresaId }, refresh));
  right.querySelector("#bGerar").addEventListener("click", async () => {
    const r = await postJSON("/api/recorrencias/gerar", { empresa_id: empresaId, ano: Number($("#rAno").value), mes: Number($("#rMes").value) });
    if (r.error) { alert(r.error); return; }
    toast(`Gerados ${r.gerados} lançamento(s); ${r.pulados} já existiam.`, r.gerados ? "ok" : "ok");
  });

  view.append(el(`<div class="kpis">
    ${kpi("Recorrências ativas", recs.length, "modelos cadastrados", "info")}
    ${kpi("Receitas fixas / mês", BRL(recs.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0)), "", "pos")}
    ${kpi("Despesas fixas / mês", BRL(recs.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.valor, 0)), "", "neg")}
  </div>`));

  const rows = recs.map((r) => `<tr>
      <td>${r.descricao || "—"}</td>
      <td><span class="pill ${r.tipo === "entrada" ? "green" : "red"}">${r.tipo}</span></td>
      <td>${r.categoria_nome || "—"}</td>
      <td>dia ${r.dia_vencimento}</td>
      <td class="${r.tipo === "entrada" ? "pos" : "neg"}">${BRL2(r.valor)}</td>
      <td><div class="row-actions"><button class="btn sm icon" aria-label="Editar recorrência" title="Editar" data-redit="${r.id}">✎</button><button class="btn sm icon red" aria-label="Excluir recorrência" title="Excluir" data-rdel="${r.id}">🗑</button></div></td>
    </tr>`).join("");
  const card = el(`<div class="card"><div class="scroll"><table class="acts"><thead><tr><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Ações</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6"><div class="empty"><div class="ic">🔁</div>Nenhuma recorrência. Cadastre despesas/receitas fixas e use "Gerar lançamentos do mês".</div></td></tr>`}</tbody></table></div></div>`);
  view.append(card);
  card.querySelectorAll("[data-redit]").forEach((b) => b.addEventListener("click", () => openRecorrenciaModal(recs.find((x) => x.id == b.dataset.redit), refresh)));
  card.querySelectorAll("[data-rdel]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmar("Excluir esta recorrência? Os lançamentos já gerados permanecem."))) return;
    await fetch("/api/recorrencias/" + b.dataset.rdel, { method: "DELETE" }); toast("Recorrência excluída."); refresh();
  }));
}

function openRecorrenciaModal(data, onSaved) {
  data = data || {};
  const isEdit = !!data.id;
  const empId = data.empresa_id;
  const optCat = (tipo) => STATE.categorias.filter((c) => c.tipo === tipo).map((c) => `<option value="${c.id}" ${data.categoria_id == c.id ? "selected" : ""}>${c.nome}</option>`).join("");
  const optUni = STATE.unidades.filter((u) => u.empresa_id == empId).map((u) => `<option value="${u.id}" ${data.unidade_id == u.id ? "selected" : ""}>${u.nome}</option>`).join("");
  const optConta = STATE.contas.map((c) => `<option value="${c.id}" ${data.conta_id == c.id ? "selected" : ""}>${c.nome}</option>`).join("");
  const optCC = STATE.centros.map((c) => `<option value="${c.id}" ${data.centro_custo_id == c.id ? "selected" : ""}>${c.nome}</option>`).join("");
  const tipo = data.tipo || "saida";
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal">
    <h3>${isEdit ? "Editar recorrência" : "Nova recorrência"}</h3>
    <div class="form-grid">
      <label class="fld">Tipo<select id="rTipo"><option value="saida" ${tipo === "saida" ? "selected" : ""}>Saída (despesa)</option><option value="entrada" ${tipo === "entrada" ? "selected" : ""}>Entrada (receita)</option></select></label>
      <label class="fld">Valor (R$)<input id="rValor" type="number" step="0.01" value="${data.valor || ""}"></label>
      <label class="fld full">Descrição<input id="rDesc" value="${(data.descricao || "").replace(/"/g, "&quot;")}"></label>
      <label class="fld">Categoria<select id="rCat">${optCat(tipo)}</select></label>
      <label class="fld">Dia do vencimento<input id="rDia" type="number" min="1" max="28" value="${data.dia_vencimento || 5}"></label>
      <label class="fld">Unidade<select id="rUni"><option value="">—</option>${optUni}</select></label>
      <label class="fld">Conta<select id="rConta"><option value="">—</option>${optConta}</select></label>
      <label class="fld full">Centro de custo<select id="rCC"><option value="">—</option>${optCC}</select></label>
    </div>
    <div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Salvar</button></div>
  </div></div>`;
  $("#rTipo").addEventListener("change", () => { $("#rCat").innerHTML = optCat($("#rTipo").value); });
  $("#mCancel").addEventListener("click", () => (root.innerHTML = ""));
  $("#mSave").addEventListener("click", async () => {
    const body = { empresa_id: empId, tipo: $("#rTipo").value, valor: Number($("#rValor").value), descricao: $("#rDesc").value,
      categoria_id: $("#rCat").value || null, dia_vencimento: Number($("#rDia").value) || 5, unidade_id: $("#rUni").value || null,
      conta_id: $("#rConta").value || null, centro_custo_id: $("#rCC").value || null };
    if (!body.valor) { alert("Informe o valor."); return; }
    const r = isEdit
      ? await fetch("/api/recorrencias/" + data.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json())
      : await postJSON("/api/recorrencias", body);
    if (r && r.error) { alert(r.error); return; }
    root.innerHTML = ""; toast("Recorrência salva."); onSaved && onSaved();
  });
}

/* ====================== RELATÓRIOS ====================== */
async function viewRelatorios(empresaId, ano) {
  if (empresaId) return viewRelatorioEmpresa(empresaId, ano);
  const view = $("#view"); view.innerHTML = "Carregando…";
  const d = await api("/api/dashboard" + (ano ? "?ano=" + ano : ""));
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Relatórios do Grupo</h1><div class="sub">DRE consolidado, resultado por empresa e evolução</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewRelatorios(null, a)));
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

async function viewRelatorioEmpresa(empresaId, ano) {
  const view = $("#view"); view.innerHTML = "Carregando…";
  const d = await api(`/api/empresa/${empresaId}/dashboard` + (ano ? "?ano=" + ano : ""));
  view.innerHTML = "";
  const e = d.empresa, k = d.kpis;
  const top = el(`<div class="topbar"><div><h1>Relatórios — ${e.nome}</h1><div class="sub">DRE da empresa${e.percentual_participacao < 100 ? ` · participação do Grupo ${e.percentual_participacao}%` : ""}</div></div></div>`);
  const right = el(`<div style="display:flex;gap:10px;align-items:center"></div>`);
  right.append(el(`<span class="sub">Ano:</span>`), anoSelector(d.anos, d.ano, (a) => viewRelatorios(empresaId, a)));
  top.append(right); view.append(top);

  view.append(el(`<div class="card" style="margin-bottom:18px"><h2>DRE ${e.nome} — ${d.ano}</h2>
    <table><tbody>
      <tr><td>(+) Receitas</td><td class="pos">${BRL2(k.faturamento)}</td></tr>
      <tr><td>(−) Despesas</td><td class="neg">${BRL2(k.despesa)}</td></tr>
      <tr class="total"><td>(=) Resultado</td><td class="${k.resultado >= 0 ? "pos" : "neg"}">${BRL2(k.resultado)}</td></tr>
      ${e.percentual_participacao < 100 ? `<tr><td>(×) Atribuível ao Grupo (${e.percentual_participacao}%)</td><td>${BRL2(k.resultadoAtribuivel)}</td></tr>` : ""}
    </tbody></table></div>`));

  const catTbl = (titulo, arr) => `<div class="card" style="margin-bottom:18px"><h2>${titulo}</h2><table><tbody>${
    arr.filter((c) => c.total > 0).map((c) => `<tr><td>${c.nome}</td><td>${BRL2(c.total)}</td></tr>`).join("") || '<tr><td class="sub">sem dados</td></tr>'}</tbody></table></div>`;
  view.append(el(catTbl("Receitas por categoria", d.porCategoriaReceita)));
  view.append(el(catTbl("Despesas por categoria", d.porCategoriaDespesa)));
  if (d.porUnidade && d.porUnidade.length)
    view.append(el(`<div class="card"><h2>Por unidade</h2><table><thead><tr><th>Unidade</th><th>Receita</th><th>Despesa</th></tr></thead><tbody>${
      d.porUnidade.map((u) => `<tr><td>${u.nome}</td><td>${BRL(u.faturamento)}</td><td>${BRL(u.despesa)}</td></tr>`).join("")}</tbody></table></div>`));
}

/* ====================== IMPORTAR PLANILHA ====================== */
async function viewImportar() {
  const view = $("#view"); view.innerHTML = "";
  view.append(el(`<div class="topbar"><div><h1>📥 Importar planilha</h1><div class="sub">Excel/CSV lido no navegador; só os lançamentos mapeados vão ao servidor</div></div></div>`));
  const empOpts = STATE.empresas.filter((e) => e.tipo !== "grupo").map((e) => `<option value="${e.id}">${e.nome}</option>`).join("");
  const passos = ["Enviar arquivo", "Mapear colunas", "Revisar", "Confirmar"];
  const wiz = el(`<section class="wizard">
    <ol class="wizard__steps">${passos.map((p, i) => `<li class="wizard__step ${i === 0 ? "is-active" : ""}" data-step="${i + 1}"><span class="wizard__num">${i + 1}</span> ${p}</li>`).join("")}</ol>
    <div class="wizard__panel is-active" data-panel="1">
      <label class="dropzone" id="impDrop"><input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden>
        <div class="dropzone__icon">📄</div>
        <div class="dropzone__text">Arraste o Excel/CSV aqui ou <u>clique para escolher</u></div>
        <div class="dropzone__hint">Formatos: .xlsx, .xls, .csv</div></label>
      <div id="impChip"></div>
      <div class="form-grid" id="impFileOpts" style="display:none;margin-top:14px">
        <label class="fld">Aba<select id="impSheet"></select></label>
        <label class="fld">Linha do cabeçalho<input type="number" id="impHeader" value="1" min="1"></label>
      </div>
    </div>
    <div class="wizard__panel" data-panel="2"><div id="impMap"></div></div>
    <div class="wizard__panel" data-panel="3"><div id="impReview"><p class="sub">Revise antes de gravar.</p></div></div>
    <div class="wizard__panel" data-panel="4"><div id="impResult"></div></div>
    <div class="wizard__nav"><button class="btn" id="wzBack" disabled>‹ Voltar</button><button class="btn primary" id="wzNext">Continuar ›</button></div>
  </section>`);
  view.append(wiz);

  let workbook = null, rowsRaw = [], step = 1, ultimaImportacao = null;

  function go(n) {
    step = Math.min(4, Math.max(1, n));
    wiz.querySelectorAll(".wizard__step").forEach((s) => { const i = +s.dataset.step; s.classList.toggle("is-active", i === step); s.classList.toggle("is-done", i < step); });
    wiz.querySelectorAll(".wizard__panel").forEach((p) => p.classList.toggle("is-active", +p.dataset.panel === step));
    $("#wzBack").disabled = step === 1 || step === 4;
    $("#wzNext").textContent = step === 3 ? "Importar" : step === 4 ? "Nova importação" : "Continuar ›";
    $("#wzNext").className = step === 3 ? "btn green" : "btn primary";
  }
  $("#wzBack").addEventListener("click", () => go(step - 1));
  $("#wzNext").addEventListener("click", async () => {
    if (step === 1) { if (!workbook) { toast("Selecione um arquivo primeiro.", "err"); return; } montarMapeamento(); go(2); }
    else if (step === 2) { if (!montarReview()) return; go(3); }
    else if (step === 3) { await commit(); }
    else if (step === 4) { viewImportar(); }
  });

  // dropzone + chip
  const drop = $("#impDrop"), fileInput = $("#impFile");
  ["dragover", "dragenter"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("is-dragover"); }));
  ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, () => drop.classList.remove("is-dragover")));
  drop.addEventListener("drop", (ev) => { ev.preventDefault(); if (ev.dataTransfer.files[0]) { fileInput.files = ev.dataTransfer.files; fileInput.dispatchEvent(new Event("change")); } });
  fileInput.addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    workbook = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    $("#impSheet").innerHTML = workbook.SheetNames.map((n) => `<option>${n}</option>`).join("");
    $("#impFileOpts").style.display = "grid";
    $("#impChip").innerHTML = `<div class="file-chip"><span>📑</span><span>${f.name}</span><span class="file-chip__size">${(f.size / 1024).toFixed(0)} KB</span></div>`;
  });

  function lerLinhas() { return XLSX.utils.sheet_to_json(workbook.Sheets[$("#impSheet").value], { header: 1, raw: true, defval: null }); }

  function montarMapeamento() {
    rowsRaw = lerLinhas();
    const hIdx = Math.max(0, (parseInt($("#impHeader").value) || 1) - 1);
    const header = (rowsRaw[hIdx] || []).map((c, i) => (c == null || c === "") ? `Coluna ${i + 1}` : String(c));
    const colOpts = `<option value="">—</option>` + header.map((c, i) => `<option value="${i}">${c}</option>`).join("");
    const uniOpts = `<option value="">—</option>` + STATE.unidades.map((u) => `<option value="${u.id}" data-emp="${u.empresa_id}">${u.nome}</option>`).join("");
    $("#impMap").innerHTML = `<p class="sub" style="margin:0 0 14px">Associe cada coluna da planilha a um campo do sistema.</p>
      <div class="form-grid">
        <label class="fld">Empresa destino *<select id="mEmpresa">${empOpts}</select></label>
        <label class="fld">Unidade (opcional)<select id="mUnidade">${uniOpts}</select></label>
        <label class="fld">Tipo *<select id="mTipoFix"><option value="saida">Saída (despesa)</option><option value="entrada">Entrada (receita)</option></select></label>
        <label class="fld">Status<select id="mStatusFix"><option value="confirmado">Confirmado</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="recebido">Recebido</option></select></label>
        <label class="fld">Coluna → Data competência *<select id="cData">${colOpts}</select></label>
        <label class="fld">Coluna → Valor *<select id="cValor">${colOpts}</select></label>
        <label class="fld">Coluna → Descrição<select id="cDesc">${colOpts}</select></label>
        <label class="fld">Coluna → Categoria (nome)<select id="cCat">${colOpts}</select></label>
        <label class="fld">Coluna → Vencimento<select id="cVenc">${colOpts}</select></label>
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="mDedup" checked style="width:auto"> Evitar duplicados</label>
      </div>`;
    $("#mEmpresa").addEventListener("change", () => {
      const emp = $("#mEmpresa").value;
      document.querySelectorAll("#mUnidade option[data-emp]").forEach((o) => o.style.display = o.dataset.emp === emp ? "" : "none");
      $("#mUnidade").value = "";
    });
  }

  function montarReview() {
    if (!$("#mEmpresa") || !$("#mEmpresa").value || $("#cData").value === "" || $("#cValor").value === "") { toast("Selecione Empresa, coluna de Data e coluna de Valor.", "err"); return false; }
    const lanc = montarLancamentos();
    const validos = lanc.filter((l) => l._valido), invalidos = lanc.filter((l) => !l._valido);
    const total = validos.reduce((s, l) => s + l.valor_liquido, 0);
    $("#impReview").innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <span class="pill green">${validos.length} válidos</span>
        <span class="pill ${invalidos.length ? "red" : ""}">${invalidos.length} com problema</span>
        <span class="pill">total ${BRL2(total)}</span></div>
      <div class="scroll"><table><thead><tr><th>Linha</th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>OK?</th></tr></thead>
      <tbody>${lanc.slice(0, 50).map((l) => `<tr><td>${l.linha}</td><td class="${l.data_competencia ? "" : "neg"}">${l.data_competencia || "inválida"}</td><td>${l.descricao || ""}</td><td>${l.categoria_nome || "—"}</td><td>${l.tipo}</td><td class="${isFinite(l.valor_liquido) && l.valor_liquido > 0 ? "" : "neg"}">${isFinite(l.valor_liquido) ? BRL2(l.valor_liquido) : "inválido"}</td><td>${l._valido ? "✅" : "⚠️"}</td></tr>`).join("")}</tbody></table></div>
      ${lanc.length > 50 ? `<div class="sub">…e mais ${lanc.length - 50} linhas.</div>` : ""}`;
    ultimaImportacao = validos;
    return true;
  }

  async function commit() {
    if (!ultimaImportacao || !ultimaImportacao.length) { toast("Nenhuma linha válida.", "err"); return; }
    const empNome = STATE.empresas.find((e) => e.id == $("#mEmpresa").value).nome;
    const r = await postJSON("/api/importar", { lancamentos: ultimaImportacao, evitarDuplicados: $("#mDedup").checked });
    if (r.error) { toast(r.error, "err"); return; }
    STATE.categorias = await api("/api/categorias");
    $("#impResult").innerHTML = `<div class="empty"><div class="ic">✅</div>
      <b>Importação concluída em ${empNome}</b></div>
      <div class="kpis">${kpi("Inseridos", r.inserted, "", "pos")}${kpi("Ignorados (duplicados)", r.skipped, "", "info")}${kpi("Com erro", r.totalErros || 0, "", r.totalErros ? "neg" : "")}</div>`;
    toast(`Importação concluída: ${r.inserted} inseridos.`);
    go(4);
  }

  function parseValor(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    let s = String(v).replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s);
  }
  function parseData(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    return null;
  }
  function montarLancamentos() {
    const hIdx = Math.max(0, (parseInt($("#impHeader").value) || 1) - 1);
    const ci = (id) => $("#" + id).value === "" ? null : parseInt($("#" + id).value);
    const cData = ci("cData"), cValor = ci("cValor"), cDesc = ci("cDesc"), cCat = ci("cCat"), cVenc = ci("cVenc");
    const empresa_id = parseInt($("#mEmpresa").value), unidade_id = $("#mUnidade").value || null, tipo = $("#mTipoFix").value, status = $("#mStatusFix").value;
    const out = [];
    rowsRaw.slice(hIdx + 1).forEach((r, idx) => {
      if (!r || r.every((c) => c == null || c === "")) return;
      const valor = cValor != null ? parseValor(r[cValor]) : NaN;
      const data = cData != null ? parseData(r[cData]) : null;
      out.push({
        linha: hIdx + 2 + idx, empresa_id, unidade_id, tipo, status,
        descricao: cDesc != null && r[cDesc] != null ? String(r[cDesc]) : "",
        categoria_nome: cCat != null && r[cCat] != null ? String(r[cCat]) : null,
        data_competencia: data, data_vencimento: cVenc != null ? parseData(r[cVenc]) : null,
        valor_liquido: valor, _valido: (valor > 0 && !!data),
      });
    });
    return out;
  }
}

/* ====================== CADASTROS ====================== */
async function viewCadastros() {
  const view = $("#view"); view.innerHTML = "Carregando…";
  const usuarios = await api("/api/usuarios");
  view.innerHTML = "";
  const top = el(`<div class="topbar"><div><h1>Cadastros</h1><div class="sub">Estrutura do sistema e usuários</div></div></div>`);
  const acts = el(`<div style="display:flex;gap:8px;flex-wrap:wrap"></div>`);
  const bUsuario = el(`<button class="btn primary">+ Usuário</button>`);
  const bConta = el(`<button class="btn">+ Conta</button>`);
  const bCat = el(`<button class="btn">+ Categoria</button>`);
  const bCentro = el(`<button class="btn">+ Centro de custo</button>`);
  const bPessoa = el(`<button class="btn">+ Pessoa</button>`);
  acts.append(bUsuario, bConta, bCat, bCentro, bPessoa); top.append(acts); view.append(top);
  bUsuario.addEventListener("click", () => openUsuarioModal(null, viewCadastros));
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
  const tblInner = (head, rows, vazio) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}"><div class="empty"><div class="ic">📋</div>${vazio || "Nada cadastrado."}</div></td></tr>`}</tbody></table></div>`;

  const empresasInner = tblInner(["Nome", "Tipo", "Participação", "Consolida"],
    STATE.empresas.map((e) => `<tr><td>${e.nome}</td><td><span class="pill">${e.tipo}</span></td><td>${e.percentual_participacao}%</td><td>${e.consolida ? '<span class="pill green">Sim</span>' : '<span class="pill amber">Não</span>'}</td></tr>`).join(""));
  const unidadesInner = tblInner(["Empresa", "Unidade", "Tipo"],
    unidades.map((u) => { const e = STATE.empresas.find((x) => x.id === u.empresa_id); return `<tr><td>${e ? e.nome : ""}</td><td>${u.nome}</td><td>${u.tipo || ""}</td></tr>`; }).join(""));
  const contasInner = tblInner(["Conta", "Banco", "Tipo"],
    STATE.contas.map((c) => `<tr><td>${c.nome}</td><td>${c.banco || ""}</td><td>${c.tipo || ""}</td></tr>`).join(""));
  const categoriasInner = tblInner(["Categoria", "Tipo"],
    STATE.categorias.map((c) => `<tr><td>${c.nome}</td><td><span class="pill ${c.tipo === "receita" ? "green" : c.tipo === "despesa" ? "red" : ""}">${c.tipo}</span></td></tr>`).join(""));
  const centrosInner = tblInner(["Nome"], STATE.centros.map((c) => `<tr><td>${c.nome}</td></tr>`).join(""));
  const usuariosInner = `<table class="acts"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ativo</th><th>Ações</th></tr></thead><tbody>${
    usuarios.map((u) => `<tr><td>${u.nome}</td><td>${u.email}</td><td><span class="pill">${u.perfil}</span></td><td>${u.ativo ? "Sim" : "Não"}</td>
      <td><div class="row-actions"><button class="btn sm" data-uedit="${u.id}">✎ Editar</button><button class="btn sm icon red" aria-label="Excluir usuário" title="Excluir" data-udel="${u.id}">🗑</button></div></td></tr>`).join("")
    || `<tr><td colspan=5 class="sub">Nenhum usuário.</td></tr>`}</tbody></table>`;
  const pessoasInner = tblInner(["Nome", "Tipo", "CPF/CNPJ", "Telefone"],
    STATE.pessoas.map((p) => `<tr><td>${p.nome}</td><td>${p.tipo || ""}</td><td>${p.cpf_cnpj || ""}</td><td>${p.telefone || ""}</td></tr>`).join(""), "Nenhuma pessoa cadastrada.");

  const defs = [
    ["empresas", "Empresas", STATE.empresas.length, empresasInner],
    ["unidades", "Unidades", unidades.length, unidadesInner],
    ["contas", "Contas", STATE.contas.length, contasInner],
    ["categorias", "Categorias", STATE.categorias.length, categoriasInner],
    ["centros", "Centros de custo", STATE.centros.length, centrosInner],
    ["usuarios", "Usuários", usuarios.length, usuariosInner],
    ["pessoas", "Pessoas", STATE.pessoas.length, pessoasInner],
  ];
  const tabsNav = el(`<nav class="tabs" role="tablist">${defs.map((t, i) => `<button class="tab ${i === 0 ? "is-active" : ""}" role="tab" data-tab="${t[0]}">${t[1]} <span class="tab__count">${t[2]}</span></button>`).join("")}</nav>`);
  const panels = el(`<div>${defs.map((t, i) => `<section class="tab-panel ${i === 0 ? "is-active" : ""}" data-panel="${t[0]}" role="tabpanel">
    <div class="panel-toolbar"><input class="search-input" type="search" placeholder="Buscar em ${t[1].toLowerCase()}…" data-search></div>
    <div class="card">${t[3]}</div></section>`).join("")}</div>`);
  view.append(tabsNav, panels);
  panels.querySelectorAll("[data-search]").forEach((inp) => inp.addEventListener("input", () => {
    const q = inp.value.toLowerCase();
    inp.closest(".tab-panel").querySelectorAll("tbody tr").forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none"; });
  }));
  const activate = (tabEl) => {
    tabsNav.querySelectorAll(".tab").forEach((t) => { const on = t === tabEl; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    panels.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === tabEl.dataset.tab));
  };
  tabsNav.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => activate(t)));
  panels.querySelectorAll("[data-uedit]").forEach((b) => b.addEventListener("click", () => openUsuarioModal(usuarios.find((x) => x.id == b.dataset.uedit), viewCadastros)));
  panels.querySelectorAll("[data-udel]").forEach((b) => b.addEventListener("click", async () => {
    const u = usuarios.find((x) => x.id == b.dataset.udel);
    if (!(await confirmar(`Excluir o usuário ${u.nome} (${u.email})? Esta ação não pode ser desfeita.`))) return;
    const r = await fetch("/api/usuarios/" + u.id, { method: "DELETE" }).then((x) => x.json());
    if (r.error) { toast(r.error, "err"); return; }
    toast("Usuário excluído."); viewCadastros();
  }));
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

/* Modal de criação/edição de usuário (com senha + acessos por empresa) */
async function openUsuarioModal(user, onSaved) {
  user = user || {};
  const isEdit = !!user.id;
  let granted = [];
  if (isEdit) { try { granted = await api("/api/usuarios/" + user.id + "/empresas"); } catch (e) { granted = []; } }
  const empresas = STATE.empresas.filter((e) => e.tipo !== "grupo");
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:480px">
    <h3>${isEdit ? "Editar usuário" : "Novo usuário"}</h3>
    <div class="form-grid">
      <label class="fld full">Nome<input id="uNome" value="${(user.nome || "").replace(/"/g, "&quot;")}"></label>
      <label class="fld full">E-mail (login)<input id="uEmail" value="${(user.email || "").replace(/"/g, "&quot;")}"></label>
      <label class="fld">Perfil<select id="uPerfil"><option value="admin" ${user.perfil === "admin" ? "selected" : ""}>Administrador</option><option value="usuario" ${user.perfil === "usuario" ? "selected" : ""}>Usuário</option></select></label>
      ${isEdit ? `<label class="fld">Ativo<select id="uAtivo"><option value="1" ${user.ativo ? "selected" : ""}>Sim</option><option value="0" ${!user.ativo ? "selected" : ""}>Não</option></select></label>` : "<span></span>"}
      <label class="fld full">Senha ${isEdit ? "<span class='sub'>(deixe em branco para manter)</span>" : ""}<input id="uSenha" type="password" autocomplete="new-password"></label>
      <div class="fld full" id="uEmpWrap">Empresas com acesso <span class="sub">(somente para perfil Usuário; Administrador vê tudo)</span>
        <div class="checks" id="uEmpresas">${empresas.map((e) => `<label><input type="checkbox" value="${e.id}" ${granted.includes(e.id) ? "checked" : ""}> ${e.nome}</label>`).join("")}</div>
      </div>
    </div>
    <div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Salvar</button></div>
  </div></div>`;
  const toggleEmp = () => { $("#uEmpWrap").style.display = $("#uPerfil").value === "admin" ? "none" : "block"; };
  $("#uPerfil").addEventListener("change", toggleEmp); toggleEmp();
  $("#mCancel").addEventListener("click", () => (root.innerHTML = ""));
  $("#mSave").addEventListener("click", async () => {
    const body = { nome: $("#uNome").value.trim(), email: $("#uEmail").value.trim(), perfil: $("#uPerfil").value };
    const senha = $("#uSenha").value;
    if (senha) body.senha = senha;
    if (isEdit) body.ativo = $("#uAtivo").value === "1";
    if (body.perfil === "usuario") body.empresa_ids = Array.from(document.querySelectorAll("#uEmpresas input:checked")).map((c) => Number(c.value));
    if (!body.nome || !body.email) { alert("Nome e e-mail são obrigatórios."); return; }
    if (!isEdit && !senha) { alert("Defina uma senha para o novo usuário."); return; }
    if (body.perfil === "usuario" && (!body.empresa_ids || !body.empresa_ids.length)) { alert("Selecione ao menos uma empresa para o usuário."); return; }
    const r = isEdit
      ? await fetch("/api/usuarios/" + user.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json())
      : await postJSON("/api/usuarios", body);
    if (r && r.error) { alert(r.error); return; }
    root.innerHTML = ""; toast(isEdit ? "Usuário atualizado." : "Usuário criado."); onSaved && onSaved();
  });
}

/* ====================== helpers de UI/charts ====================== */
function kpi(lbl, val, sub = "", cls = "", hero = false, trend = "", tip = "") {
  const cap = [sub, trend].filter(Boolean).join(" · ");
  const tt = tip ? ` data-tooltip="${String(tip).replace(/"/g, "&quot;")}"` : "";
  return `<div class="kpi ${cls} ${hero ? "hero" : ""}"${tt}><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div>${cap ? `<div class="sub">${cap}</div>` : ""}</div>`;
}
// pílula de tendência vs período anterior. invert=true → aumento é ruim (ex.: custo)
function trendPill(cur, prev, invert = false, anoPrev = "") {
  if (prev == null || prev === 0 || !isFinite(prev)) return "";
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const bom = invert ? !up : up;
  return `<span class="kpi-trend ${bom ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span>${anoPrev ? " vs " + anoPrev : ""}`;
}
function mesesComDados(sm) { let n = 0; for (let i = 0; i < 12; i++) if (sm.entrada[i] || sm.saida[i]) n = i + 1; return n || 12; }
function skeletonDash() {
  const cards = Array.from({ length: 5 }).map((_, i) => `<div class="kpi ${i === 0 ? "hero" : ""}"><div class="skeleton sk-text"></div><div class="skeleton sk-val"></div><div class="skeleton sk-text" style="width:45%"></div></div>`).join("");
  return `<div class="topbar"><div class="skeleton" style="width:260px;height:24px"></div></div>
    <div class="kpis">${cards}</div>
    <div class="grid"><div class="card col-8"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton" style="height:260px;margin-top:12px;border-radius:8px"></div></div>
    <div class="card col-4"><div class="skeleton sk-line" style="width:50%"></div><div class="skeleton" style="height:260px;margin-top:12px;border-radius:8px"></div></div></div>`;
}
function bar(label, data, color) { return { type: "bar", label, data, backgroundColor: color }; }
function line(label, data, color) { return { type: "line", label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: .3 }; }
function lineBarCfg(labels, datasets) {
  return { data: { labels, datasets }, options: { maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { tooltip: { backgroundColor: "#0D1117", borderColor: "#3A4756", borderWidth: 1, padding: 10, cornerRadius: 8,
      titleColor: "#E6EDF5", bodyColor: "#8B98A5",
      callbacks: { label: (c) => ` ${c.dataset.label}: ${BRL2(c.parsed.y)}` } } },
    scales: { y: { ticks: { callback: (v) => BRL(v) } } } } };
}
function doughnutCfg(labels, data) {
  return { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: PALETTE }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.label}: ${BRL(c.parsed)}` } } } } };
}

boot();
