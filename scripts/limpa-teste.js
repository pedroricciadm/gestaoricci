const db = require("../db");
const u = db.prepare("SELECT id FROM usuarios WHERE email='brc@x.com'").get();
if (u) {
  db.prepare("DELETE FROM permissoes_usuario_empresa WHERE usuario_id=?").run(u.id);
  db.prepare("DELETE FROM sessoes WHERE usuario_id=?").run(u.id);
  db.prepare("DELETE FROM usuarios WHERE id=?").run(u.id);
  console.log("removido brc@x.com id", u.id);
} else console.log("brc@x.com nao existe");
console.log("usuarios:", db.prepare("SELECT email,perfil FROM usuarios").all().map((x) => x.email + "(" + x.perfil + ")").join(", "));
