/*
 * Define/atualiza a senha de um usuário (cria se não existir).
 * Uso: node set-senha.js <email> <senha> [nome]
 */
const db = require("./db");
const { hashSenha } = require("./auth");

const [, , email, senha, nome] = process.argv;
if (!email || !senha) {
  console.log("Uso: node set-senha.js <email> <senha> [nome]");
  process.exit(1);
}
const hash = hashSenha(senha);
const existe = db.prepare("SELECT id FROM usuarios WHERE lower(email)=lower(?)").get(email);
if (existe) {
  db.prepare("UPDATE usuarios SET senha_hash=?, ativo=1 WHERE id=?").run(hash, existe.id);
  console.log("Senha atualizada para", email);
} else {
  db.prepare("INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo) VALUES (?,?,?,?,1)")
    .run(nome || email, email, hash, "admin");
  console.log("Usuário criado:", email);
}
