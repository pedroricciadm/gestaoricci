/*
 * Backup consistente do banco SQLite (funciona com WAL ativo).
 * Gera data/backups/ricci-YYYYMMDD-HHMMSS.db e mantém os últimos N.
 * Uso: node scripts/backup.js   (ou: npm run backup)
 * Agendar no Windows: ver BACKUP.bat (Agendador de Tarefas, diário).
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const RETENCAO = Number(process.env.BACKUP_RETENCAO || 14); // quantos backups manter
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "ricci.db");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

if (!fs.existsSync(DB_FILE)) {
  console.error("Banco não encontrado:", DB_FILE);
  process.exit(1);
}
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const d = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const destino = path.join(BACKUP_DIR, `ricci-${stamp}.db`);

// VACUUM INTO produz uma cópia íntegra mesmo com o servidor aberto (WAL)
const db = new Database(DB_FILE, { readonly: true });
db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
db.close();

const tam = (fs.statSync(destino).size / 1024).toFixed(0);
console.log(`✔ Backup criado: ${path.basename(destino)} (${tam} KB)`);

// Retenção: remove os mais antigos além do limite
const antigos = fs.readdirSync(BACKUP_DIR)
  .filter((f) => /^ricci-\d{8}-\d{6}\.db$/.test(f))
  .sort(); // nome ordenável por data
const excedente = antigos.slice(0, Math.max(0, antigos.length - RETENCAO));
for (const f of excedente) {
  fs.unlinkSync(path.join(BACKUP_DIR, f));
  console.log(`  removido antigo: ${f}`);
}
console.log(`  mantidos: ${Math.min(antigos.length, RETENCAO)} / retenção ${RETENCAO}`);
