// Inspeciona a estrutura das planilhas-chave do Grupo Ricci
const XLSX = require("xlsx");
const path = require("path");

const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";

const files = [
  ["GRUPO RICCI", "Grupo_Ricci_2026_v5.xlsx"],
  ["GRUPO RICCI", "Grupo Ricci - 2025.xlsx"],
  ["GRUPO RICCI", "Grupo Ricci - Histórico geral.xlsx"],
  ["AGF - Agência de Correios", "Financeiro Geral - AGF 2026.xlsx"],
  ["Família", "Financeiro Geral 2024.xlsx"],
];

for (const [folder, file] of files) {
  const full = path.join(BASE, folder, file);
  console.log("\n" + "=".repeat(90));
  console.log("ARQUIVO:", folder + " / " + file);
  console.log("=".repeat(90));
  let wb;
  try {
    wb = XLSX.readFile(full, { cellDates: true, cellFormula: false, cellStyles: false });
  } catch (e) {
    console.log("  ERRO ao abrir:", e.message);
    continue;
  }
  console.log("ABAS (" + wb.SheetNames.length + "):");
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] || "vazia";
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const rows = range ? range.e.r - range.s.r + 1 : 0;
    const cols = range ? range.e.c - range.s.c + 1 : 0;
    console.log(`  - "${name}"  [${ref}]  ${rows} linhas x ${cols} cols`);
  }
}
