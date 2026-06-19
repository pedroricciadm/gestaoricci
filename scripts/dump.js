const XLSX = require("xlsx");
const path = require("path");
const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";

function dump(folder, file, sheets, maxRows) {
  const wb = XLSX.readFile(path.join(BASE, folder, file), { cellDates: true });
  for (const s of sheets) {
    const ws = wb.Sheets[s];
    if (!ws) { console.log("  (aba não existe:", s, ")"); continue; }
    console.log("\n----- [" + file + "] aba: " + s + " -----");
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    rows.slice(0, maxRows).forEach((r, i) => {
      // compacta: remove nulls à direita
      let last = r.length - 1;
      while (last >= 0 && (r[last] === null || r[last] === "")) last--;
      const fmt = r.slice(0, last + 1).map(v => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "number") return Math.round(v * 100) / 100;
        return v;
      });
      console.log(String(i).padStart(3), JSON.stringify(fmt));
    });
  }
}

console.log("########## HISTÓRICO GERAL (séries mensais) ##########");
dump("GRUPO RICCI", "Grupo Ricci - Histórico geral.xlsx",
  ["Faturamento Total", "Faturamento Grupo Ricci", "Faturamento AGF", "Faturamento Correios", "Despesas Total", "Recebimento Total", "Saldo", "Evolução"], 90);

console.log("\n\n########## MESTRE 2026 - DASHBOARD ##########");
dump("GRUPO RICCI", "Grupo_Ricci_2026_v5.xlsx", ["DASHBOARD"], 60);

console.log("\n\n########## MESTRE 2026 - Financeiro Geral (cabeçalho) ##########");
dump("GRUPO RICCI", "Grupo_Ricci_2026_v5.xlsx", ["Financeiro Geral"], 12);
