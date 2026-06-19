/*
 * Importa os dados das planilhas (OneDrive) para o banco.
 * - Detalhe por empresa/categoria/mês -> tabela lancamentos (origem='importacao')
 * - Totais por ano -> tabela evolucao_anual (visão de evolução histórica)
 * Idempotente: limpa lançamentos importados e a evolução antes de reimportar.
 * Executar: node import-excel.js
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const db = require("./db");

const BASE = "C:\\Users\\Win10\\OneDrive\\Documentos\\Projetos Cloud\\Gestão Ricci";
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

// Caminhos dos arquivos anuais (Financeiro Geral)
const ARQ_ANO = {
  2017: ["GRUPO RICCI", "2017", "Grupo Ricci - 2017.xlsx"],
  2018: ["GRUPO RICCI", "2018", "Grupo Ricci - 2018.xlsx"],
  2019: ["GRUPO RICCI", "2019", "Grupo Ricci - 2019.xlsx"],
  2020: ["GRUPO RICCI", "2020", "Grupo Ricci - 2020.xlsx"],
  2021: ["GRUPO RICCI", "2021", "Grupo Ricci - 2021.xlsx"],
  2022: ["GRUPO RICCI", "2022", "Grupo Ricci - 2022.xlsx"],
  2023: ["GRUPO RICCI", "2023", "Grupo Ricci - 2023.xlsx"],
  2024: ["GRUPO RICCI", "2024", "Grupo Ricci - 2024.xlsx"],
  2025: ["GRUPO RICCI", "2025", "Grupo Ricci - 2025.xlsx"],
  2026: ["GRUPO RICCI", "Grupo_Ricci_2026_v5.xlsx"],
};

// Classificador: rótulo da linha -> {tipo, empresa, categoria, unidade?}
// tipo: entrada | saida
const CLASSIFIER = {
  // RECEITAS
  "Faturamento 220 log": { tipo: "entrada", empresa: "BRC", categoria: "Faturamento logístico", unidade: "220 Log" },
  "PDV MAIS ENVIOS": { tipo: "entrada", empresa: "Mais Envios", categoria: "PDV", unidade: "PDV" },
  "FATURADO MAIS ENVIOS": { tipo: "entrada", empresa: "Mais Envios", categoria: "Faturado", unidade: "Faturado" },
  "Comissão AGF": { tipo: "entrada", empresa: "Agência dos Correios", categoria: "Comissão", unidade: "AGF Matriz" },
  "Distribuição AGF": { tipo: "entrada", empresa: "Agência dos Correios", categoria: "Distribuição", unidade: "AGF Matriz" },
  "Taxas Boleto": { tipo: "entrada", empresa: "Agência dos Correios", categoria: "Taxas", unidade: "AGF Matriz" },
  "Kit de Marketing": { tipo: "entrada", empresa: "Agência dos Correios", categoria: "Outros recebimentos", unidade: "AGF Matriz" },
  "Outros / Selos": { tipo: "entrada", empresa: "Agência dos Correios", categoria: "Outros recebimentos", unidade: "AGF Matriz" },
  "Investimentos e Rendimento": { tipo: "entrada", empresa: "Investimentos", categoria: "Rendimentos" },
  "Faturamento Grupo Ricci": { tipo: "entrada", empresa: "Grupo Ricci (Loja)", categoria: "Vendas loja", unidade: "Loja" },
  "220 Log Caiçara": { tipo: "entrada", empresa: "Licenciados", categoria: "Ponto licenciado", unidade: "Caiçara" },
  "220 Log Anchieta": { tipo: "entrada", empresa: "Licenciados", categoria: "Ponto licenciado", unidade: "Anchieta" },
  "AGF Prudente": { tipo: "entrada", empresa: "Licenciados", categoria: "Ponto licenciado", unidade: "Prudente" },
  "JD. Canadá": { tipo: "entrada", empresa: "Licenciados", categoria: "Ponto licenciado", unidade: "Jd. Canadá" },
  "AGF Boa Esperança": { tipo: "entrada", empresa: "Licenciados", categoria: "Ponto licenciado", unidade: "Boa Esperança" },
  // DESPESAS (somam o "Custo Total" sem duplicar)
  "Despesas Fixas": { tipo: "saida", empresa: "BRC", categoria: "Despesas Fixas" },
  "Despesas Variáveis": { tipo: "saida", empresa: "BRC", categoria: "Despesas Variáveis" },
  "Impostos": { tipo: "saida", empresa: "BRC", categoria: "Impostos" },
  "Folha de Pagamento": { tipo: "saida", empresa: "BRC", categoria: "Folha de Pagamento" },
  "Grupo Ricci": { tipo: "saida", empresa: "Grupo Ricci (Loja)", categoria: "Conveniência / Loja", unidade: "Loja" },
  "Família (Retirada)": { tipo: "saida", empresa: "Família", categoria: "Distribuição familiar", unidade: "Família" },
};
// Rótulos que são subtotais/fluxo e devem ser ignorados no detalhe
const IGNORAR = new Set([
  "Correios", "Custo 220 Log", "Custo Grupo Ricci", "Custo Total", "Faturamento Total",
  "Resultado", "Resultado da Empresa", "Resultado sem Investimento", "Resultado Financeiro Geral",
  "Investimento Total", "Distribuição de Lucro", "Recebimento", "Pagamentos", "Recebimento X Pagamentos",
  "Saldo atual",
]);

const norm = (s) => String(s == null ? "" : s).trim();
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

// Resolve ids de empresa/unidade/categoria por nome
function lookups() {
  const empByName = {};
  for (const e of db.prepare("SELECT id,nome FROM empresas").all()) empByName[e.nome] = e.id;
  const catByName = {};
  for (const c of db.prepare("SELECT id,nome FROM categorias").all()) catByName[c.nome] = c.id;
  const uniByEmpName = {};
  for (const u of db.prepare("SELECT u.id,u.nome,u.empresa_id FROM unidades u").all())
    uniByEmpName[u.empresa_id + "|" + u.nome] = u.id;
  return { empByName, catByName, uniByEmpName };
}

function openFinGeral(ano) {
  const parts = ARQ_ANO[ano];
  if (!parts) return null;
  const full = path.join(BASE, ...parts);
  if (!fs.existsSync(full)) { console.log(`  [${ano}] arquivo não encontrado`); return null; }
  const wb = XLSX.readFile(full, { cellDates: true });
  const ws = wb.Sheets["Financeiro Geral"];
  if (!ws) { console.log(`  [${ano}] sem aba 'Financeiro Geral'`); return null; }
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

function run() {
  const L = lookups();
  // limpa importações anteriores
  db.prepare("DELETE FROM lancamentos WHERE origem='importacao'").run();
  db.prepare("DELETE FROM evolucao_anual").run();

  const insLanc = db.prepare(`INSERT INTO lancamentos
    (empresa_id,unidade_id,categoria_id,tipo,descricao,data_competencia,valor_liquido,valor_bruto,status,origem)
    VALUES (@empresa_id,@unidade_id,@categoria_id,@tipo,@descricao,@data_competencia,@valor,@valor,'confirmado','importacao')`);
  const insEvo = db.prepare(`INSERT OR REPLACE INTO evolucao_anual
    (ano,faturamento_total,custo_total,resultado,recebimentos,pagamentos) VALUES (?,?,?,?,?,?)`);

  const resumo = [];
  const tx = db.transaction(() => {
    for (const ano of Object.keys(ARQ_ANO).map(Number).sort()) {
      const rows = openFinGeral(ano);
      if (!rows) continue;
      // localizar linha de cabeçalho com JAN..DEZ
      let hr = rows.findIndex((r) => r && r.includes("JAN") && r.includes("DEZ"));
      if (hr < 0) hr = 2;
      const header = rows[hr];
      const monthCols = MESES.map((m) => header.indexOf(m));
      const totalCol = header.indexOf("Total");

      let nLanc = 0, fatTotal = 0, custoTotal = 0, receb = 0, pag = 0;
      for (let r = hr + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const label = norm(row[0]);
        if (!label) continue;
        // captura totais para evolução
        if (label === "Faturamento Total") fatTotal = num(row[totalCol]);
        if (label === "Custo Total") custoTotal = num(row[totalCol]);
        if (label === "Recebimento") receb = num(row[totalCol]);
        if (label === "Pagamentos") pag = num(row[totalCol]);
        if (IGNORAR.has(label)) continue;
        const cls = CLASSIFIER[label];
        if (!cls) continue;
        const empresa_id = L.empByName[cls.empresa];
        const categoria_id = L.catByName[cls.categoria] || null;
        const unidade_id = cls.unidade ? (L.uniByEmpName[empresa_id + "|" + cls.unidade] || null) : null;
        if (!empresa_id) continue;
        for (let m = 0; m < 12; m++) {
          const col = monthCols[m];
          if (col < 0) continue;
          const v = num(row[col]);
          if (!v) continue;
          const mm = String(m + 1).padStart(2, "0");
          insLanc.run({
            empresa_id, unidade_id, categoria_id, tipo: cls.tipo,
            descricao: `${label} (importado)`,
            data_competencia: `${ano}-${mm}-15`,
            valor: Math.round(v * 100) / 100,
          });
          nLanc++;
        }
      }
      insEvo.run(ano, fatTotal, custoTotal, fatTotal - custoTotal, receb, pag);
      resumo.push({ ano, lancamentos: nLanc, fatTotal: Math.round(fatTotal), custoTotal: Math.round(custoTotal) });
    }
  });
  tx();

  console.log("Importação concluída:");
  console.table(resumo);
  const tot = db.prepare("SELECT COUNT(*) n, ROUND(SUM(valor_liquido)) soma FROM lancamentos WHERE origem='importacao'").get();
  console.log("Total de lançamentos importados:", tot.n, "| soma R$", tot.soma);
}

run();
module.exports = { run };
