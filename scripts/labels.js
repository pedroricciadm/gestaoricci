const XLSX = require("xlsx");
const path = require("path");
const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";

function labels(folder, file) {
  const wb = XLSX.readFile(path.join(BASE, folder, file), { cellDates: true });
  const ws = wb.Sheets["Financeiro Geral"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log("\n===== " + file + " — Financeiro Geral (rótulo => Total) =====");
  rows.forEach((r) => {
    const lbl = r[0];
    if (lbl === null || lbl === undefined || lbl === "" || lbl === "-") return;
    const total = r[14];
    console.log("  " + String(lbl).padEnd(34) + (typeof total === "number" ? total.toFixed(2) : ""));
  });
}
labels("GRUPO RICCI", "Grupo_Ricci_2026_v5.xlsx");
labels("GRUPO RICCI", "2025\\Grupo Ricci - 2025.xlsx");
