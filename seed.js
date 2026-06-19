/*
 * Seed de cadastros básicos do Grupo RICCI. Idempotente: só popula se vazio.
 * Executar: node seed.js
 */
const db = require("./db");

function seed() {
  const jaTem = db.prepare("SELECT COUNT(*) n FROM empresas").get().n;
  if (jaTem > 0) {
    console.log("Cadastros já existem (", jaTem, "empresas). Pulando seed.");
    return;
  }

  const insEmp = db.prepare(
    `INSERT INTO empresas (nome,tipo,percentual_participacao,empresa_pai_id,cor,consolida,ordem) VALUES (?,?,?,?,?,?,?)`
  );
  // Grupo (raiz)
  const grupo = insEmp.run("Grupo RICCI", "grupo", 100, null, "#4cc2ff", 0, 0).lastInsertRowid;
  // Frentes
  const brc = insEmp.run("BRC", "empresa", 100, grupo, "#4cc2ff", 1, 1).lastInsertRowid;
  const mais = insEmp.run("Mais Envios", "empresa", 100, brc, "#56d4dd", 1, 2).lastInsertRowid;
  const agf = insEmp.run("Agência dos Correios", "empresa", 40, grupo, "#d29922", 1, 3).lastInsertRowid;
  const loja = insEmp.run("Grupo Ricci (Loja)", "empresa", 100, grupo, "#a371f7", 1, 4).lastInsertRowid;
  const lic = insEmp.run("Licenciados", "empresa", 100, grupo, "#7ee787", 1, 5).lastInsertRowid;
  // Família: NÃO consolida no resultado operacional (distribuição compulsória)
  const fam = insEmp.run("Família", "centro", 100, grupo, "#ff7b72", 0, 6).lastInsertRowid;
  // Investimentos (centro financeiro)
  const inv = insEmp.run("Investimentos", "centro", 100, grupo, "#e3b341", 1, 7).lastInsertRowid;

  const empMap = { grupo, brc, mais, agf, loja, lic, fam, inv };

  // Unidades
  const insUni = db.prepare(`INSERT INTO unidades (empresa_id,nome,tipo) VALUES (?,?,?)`);
  const uni = {};
  uni.brc220 = insUni.run(brc, "220 Log", "operacao").lastInsertRowid;
  uni.maisPdv = insUni.run(mais, "PDV", "ponto").lastInsertRowid;
  uni.maisFat = insUni.run(mais, "Faturado", "ponto").lastInsertRowid;
  uni.agfMatriz = insUni.run(agf, "AGF Matriz", "agencia").lastInsertRowid;
  uni.lojaGeral = insUni.run(loja, "Loja", "loja").lastInsertRowid;
  uni.famGeral = insUni.run(fam, "Família", "familia").lastInsertRowid;
  insUni.run(lic, "Caiçara", "ponto");
  insUni.run(lic, "Anchieta", "ponto");
  insUni.run(lic, "Prudente", "ponto");
  insUni.run(lic, "Jd. Canadá", "ponto");
  insUni.run(lic, "Boa Esperança", "ponto");

  // Contas financeiras (do bloco Saldo de Caixa do DASHBOARD)
  const insConta = db.prepare(
    `INSERT INTO contas_financeiras (empresa_id,nome,banco,tipo,saldo_inicial) VALUES (?,?,?,?,?)`
  );
  insConta.run(brc, "Dinheiro", "Caixa", "caixa", 0);
  insConta.run(brc, "Santander BRC", "Santander", "conta_corrente", 0);
  insConta.run(brc, "Sicoob", "Sicoob", "conta_corrente", 0);
  insConta.run(brc, "Inter BRC", "Inter", "conta_corrente", 0);
  insConta.run(agf, "Santander Agência", "Santander", "conta_corrente", 0);

  // Categorias
  const insCat = db.prepare(`INSERT INTO categorias (nome,tipo) VALUES (?,?)`);
  const catR = (n) => insCat.run(n, "receita").lastInsertRowid;
  const catD = (n) => insCat.run(n, "despesa").lastInsertRowid;
  const cat = {};
  cat["Faturamento logístico"] = catR("Faturamento logístico");
  cat["Comissão"] = catR("Comissão");
  cat["Distribuição"] = catR("Distribuição");
  cat["PDV"] = catR("PDV");
  cat["Faturado"] = catR("Faturado");
  cat["Vendas loja"] = catR("Vendas loja");
  cat["Rendimentos"] = catR("Rendimentos");
  cat["Ponto licenciado"] = catR("Ponto licenciado");
  cat["Taxas"] = catR("Taxas");
  cat["Outros recebimentos"] = catR("Outros recebimentos");

  cat["Despesas Fixas"] = catD("Despesas Fixas");
  cat["Despesas Variáveis"] = catD("Despesas Variáveis");
  cat["Impostos"] = catD("Impostos");
  cat["Folha de Pagamento"] = catD("Folha de Pagamento");
  cat["Conveniência / Loja"] = catD("Conveniência / Loja");
  cat["Distribuição familiar"] = catD("Distribuição familiar");
  cat["Aluguel"] = catD("Aluguel");
  cat["Energia"] = catD("Energia");
  cat["Internet"] = catD("Internet");
  cat["Combustível"] = catD("Combustível");
  cat["Manutenção"] = catD("Manutenção");
  cat["Despesas operacionais"] = catD("Despesas operacionais");
  cat["Despesas administrativas"] = catD("Despesas administrativas");
  cat["Distribuição de lucros"] = catD("Distribuição de lucros");
  cat["Investimento"] = catD("Investimento");
  cat["Outros"] = catD("Outros");
  insCat.run("Transferência entre contas", "transferencia");

  // Centros de custo (globais)
  const insCC = db.prepare(`INSERT INTO centros_custo (empresa_id,nome) VALUES (?,?)`);
  ["Administração", "Operação", "Comercial", "Financeiro", "Frota", "Agência", "Loja", "Família", "Investimentos"]
    .forEach((n) => insCC.run(null, n));

  // Usuário admin inicial (sem senha real ainda)
  db.prepare(`INSERT INTO usuarios (nome,email,perfil) VALUES (?,?,?)`).run("Administrador", "admin@gruporicci.local", "admin");

  console.log("Seed concluído.");
  console.log("Empresas:", db.prepare("SELECT id,nome,tipo,percentual_participacao FROM empresas").all());
}

seed();
module.exports = { seed };
