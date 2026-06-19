/* Autenticação — hash de senha (scrypt, sem dependências) + sessões */
const crypto = require("crypto");
const db = require("./db");

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifySenha(senha, armazenado) {
  if (!armazenado || !armazenado.includes(":")) return false;
  const [salt, hash] = armazenado.split(":");
  const calc = crypto.scryptSync(senha, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(calc, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessoes (token, usuario_id) VALUES (?,?)").run(token, usuarioId);
  return token;
}

function usuarioPorSessao(token) {
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.nome, u.email, u.perfil
    FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token=? AND u.ativo=1`).get(token) || null;
}

function removerSessao(token) {
  if (token) db.prepare("DELETE FROM sessoes WHERE token=?").run(token);
}

// lê o cookie ricci_sess da requisição
function tokenDoCookie(req) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === "ricci_sess") return decodeURIComponent(v || "");
  }
  return null;
}

module.exports = { hashSenha, verifySenha, criarSessao, usuarioPorSessao, removerSessao, tokenDoCookie };
