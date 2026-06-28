/*
 * Banco de dados (SQLite via better-sqlite3) — Sistema de Gestão Grupo RICCI.
 * Cria o schema multiempresa conforme a especificação e expõe a conexão.
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "ricci.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                       -- grupo | empresa | unidade | centro
  percentual_participacao REAL DEFAULT 100, -- % do resultado que pertence ao grupo
  empresa_pai_id INTEGER,
  cor TEXT,                                 -- cor para gráficos
  consolida INTEGER DEFAULT 1,              -- entra no resultado operacional consolidado?
  ordem INTEGER DEFAULT 0,
  ativa INTEGER DEFAULT 1,
  FOREIGN KEY (empresa_pai_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS unidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT,
  ativa INTEGER DEFAULT 1,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS contas_financeiras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  nome TEXT NOT NULL,
  banco TEXT,
  tipo TEXT,                                -- caixa | conta_corrente | aplicacao
  saldo_inicial REAL DEFAULT 0,
  ativa INTEGER DEFAULT 1,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                       -- receita | despesa | transferencia
  categoria_pai_id INTEGER,
  ativa INTEGER DEFAULT 1,
  FOREIGN KEY (categoria_pai_id) REFERENCES categorias(id)
);

CREATE TABLE IF NOT EXISTS centros_custo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  nome TEXT NOT NULL,
  ativa INTEGER DEFAULT 1,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT,                                -- cliente | fornecedor | colaborador | socio | familiar | parceiro
  cpf_cnpj TEXT,
  empresa_id INTEGER,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  observacoes TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  unidade_id INTEGER,
  conta_id INTEGER,
  pessoa_id INTEGER,
  categoria_id INTEGER,
  centro_custo_id INTEGER,
  tipo TEXT NOT NULL,                       -- entrada | saida | transferencia
  descricao TEXT,
  data_competencia TEXT,                    -- YYYY-MM-DD
  data_vencimento TEXT,
  data_pagamento TEXT,
  valor_bruto REAL DEFAULT 0,
  desconto REAL DEFAULT 0,
  taxa REAL DEFAULT 0,
  valor_liquido REAL NOT NULL,
  status TEXT DEFAULT 'confirmado',         -- pendente | confirmado | pago | recebido | atrasado | cancelado
  recorrente INTEGER DEFAULT 0,
  origem TEXT DEFAULT 'manual',             -- manual | importacao
  conta_destino_id INTEGER,                 -- p/ transferências
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (conta_id) REFERENCES contas_financeiras(id),
  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id)
);
CREATE INDEX IF NOT EXISTS idx_lanc_emp ON lancamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lanc_data ON lancamentos(data_competencia);
CREATE INDEX IF NOT EXISTS idx_lanc_tipo ON lancamentos(tipo);

CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamento_id INTEGER NOT NULL,
  nome_arquivo TEXT,
  caminho_arquivo TEXT,
  tipo_arquivo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  senha_hash TEXT,
  perfil TEXT DEFAULT 'admin',
  ativo INTEGER DEFAULT 1
);

-- Série anual consolidada (totais por ano), para a visão de evolução histórica
CREATE TABLE IF NOT EXISTS evolucao_anual (
  ano INTEGER PRIMARY KEY,
  faturamento_total REAL DEFAULT 0,
  custo_total REAL DEFAULT 0,
  resultado REAL DEFAULT 0,
  recebimentos REAL DEFAULT 0,
  pagamentos REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS permissoes_usuario_empresa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  permissao TEXT DEFAULT 'leitura',         -- leitura | escrita | admin
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
`);

// Recorrências (modelos de lançamentos fixos mensais)
db.exec(`
CREATE TABLE IF NOT EXISTS recorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  unidade_id INTEGER,
  conta_id INTEGER,
  categoria_id INTEGER,
  centro_custo_id INTEGER,
  pessoa_id INTEGER,
  tipo TEXT NOT NULL,                 -- entrada | saida
  descricao TEXT,
  valor REAL NOT NULL,
  dia_vencimento INTEGER DEFAULT 5,   -- dia do mês (1-28)
  ativa INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
`);

// Migração idempotente: coluna recorrencia_id em lancamentos (DB já existente em produção)
const _lancCols = db.prepare("PRAGMA table_info(lancamentos)").all().map((c) => c.name);
if (!_lancCols.includes("recorrencia_id")) {
  db.exec("ALTER TABLE lancamentos ADD COLUMN recorrencia_id INTEGER");
}
// Migração idempotente: soft delete em lancamentos (preserva histórico em vez de apagar)
if (!_lancCols.includes("deletado")) {
  db.exec("ALTER TABLE lancamentos ADD COLUMN deletado INTEGER DEFAULT 0");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_lanc_deletado ON lancamentos(deletado)");

// Trilha de auditoria: quem fez o quê, quando (ações financeiras sensíveis)
db.exec(`
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nome TEXT,
  acao TEXT NOT NULL,          -- criar | editar | excluir | baixar | importar
  entidade TEXT NOT NULL,      -- lancamento | conta | usuario | ...
  entidade_id INTEGER,
  detalhe TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_aud_entidade ON auditoria(entidade, entidade_id);
`);

module.exports = db;
