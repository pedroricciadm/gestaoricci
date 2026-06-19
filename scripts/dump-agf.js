const XLSX = require("xlsx");
const path = require("path");
const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";
const f = path.join(BASE, "AGF - Agência de Correios", "Financeiro Geral - AGF 2026.xlsx");
const wb = XLSX.readFile(f, { cellDates: true });

for (const s of ["Resumo Geral", "Saldo"]) {
  console.log("\n===== aba:", s, "=====");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: null });
  rows.forEach((r, i) => {
    let last = r.length - 1;
    while (last >= 0 && (r[last] === null || r[last] === "")) last--;
    if (last < 0) return;
    const fmt = r.slice(0, last + 1).map(v =>
      v instanceof Date ? v.toISOString().slice(0, 10) : (typeof v === "number" ? Math.round(v * 100) / 100 : v));
    console.log(String(i).padStart(3), JSON.stringify(fmt));
  });
}
// cabeçalhos de Despesas e Vendas
for (const s of ["Despesas", "Vendas"]) {
  console.log("\n===== aba:", s, "(5 primeiras linhas) =====");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: null });
  rows.slice(0, 5).forEach((r, i) => console.log(String(i).padStart(3), JSON.stringify(r.slice(0, 14))));
}
