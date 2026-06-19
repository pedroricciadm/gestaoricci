// Verifica better-sqlite3 e inspeciona os arquivos anuais históricos
try {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t(x); INSERT INTO t VALUES (1);");
  console.log("better-sqlite3 OK ->", db.prepare("SELECT x FROM t").get().x);
  db.close();
} catch (e) {
  console.log("better-sqlite3 FALHOU:", e.message);
}

const XLSX = require("xlsx");
const path = require("path");
const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";

// Estrutura de abas de cada anual
for (const ano of [2017, 2020, 2024, 2025]) {
  const f = path.join(BASE, "GRUPO RICCI", String(ano), `Grupo Ricci - ${ano}.xlsx`);
  try {
    const wb = XLSX.readFile(f, { bookSheets: true });
    console.log(`\n[${ano}] abas:`, wb.SheetNames.join(" | "));
  } catch (e) {
    console.log(`\n[${ano}] ERRO: ${e.message}`);
  }
}

// Detalhe da aba DASHBOARD (se existir) ou Financeiro Geral do 2025 e 2024
for (const ano of [2025, 2024]) {
  const f = path.join(BASE, "GRUPO RICCI", String(ano), `Grupo Ricci - ${ano}.xlsx`);
  const wb = XLSX.readFile(f, { cellDates: true });
  const aba = wb.SheetNames.find(n => /dashboard/i.test(n)) || wb.SheetNames.find(n => /financeiro/i.test(n)) || wb.SheetNames[0];
  console.log(`\n===== [${ano}] aba "${aba}" (linhas 0-15) =====`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: null });
  rows.slice(0, 16).forEach((r, i) => {
    let last = r.length - 1; while (last >= 0 && (r[last] === null || r[last] === "")) last--;
    const fmt = r.slice(0, last + 1).map(v => v instanceof Date ? v.toISOString().slice(0,10) : (typeof v === "number" ? Math.round(v*100)/100 : v));
    if (last >= 0) console.log(String(i).padStart(3), JSON.stringify(fmt));
  });
}
