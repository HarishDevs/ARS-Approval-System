// Break-glass account (D-011, F-53, P1-36). Run ONLY from the hosting
// console (GoDaddy cPanel terminal) by the holder, itadmin@ (D-041, D-042).
// There is deliberately no web screen for any of this.
//
//   node scripts/admin/break-glass.js status
//   node scripts/admin/break-glass.js create --email <address> --whatsapp <number>
//   node scripts/admin/break-glass.js set-password          (asks, hidden)
//   node scripts/admin/break-glass.js enable --minutes 60   (max 240)
//   node scripts/admin/break-glass.js disable
//
// Every command writes an audit entry (source: console). Signing in still
// needs the WhatsApp code (Q-015) and alerts every Super Admin (N-05).
const crypto = require("node:crypto");
const os = require("node:os");
const readline = require("node:readline");
const { connect } = require("../database/env");

const LOGIN_ID = "breakglass";
const MAX_MINUTES = 240;
const MIN_PASSWORD_LENGTH = 14;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

// Same format as lib/security/password.ts: scrypt$N$r$p$salt$hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Asks several questions on ONE readline session (closing it between
// questions would swallow the rest of piped input). Typing is not echoed.
async function askHidden(questions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  // Only prompts are written; typed characters are never echoed.
  rl._writeToOutput = () => {};
  const lines = rl[Symbol.asyncIterator]();
  const answers = [];
  try {
    for (const question of questions) {
      process.stdout.write(question);
      const next = await lines.next();
      process.stdout.write("\n");
      if (next.done) throw new Error("No input.");
      answers.push(next.value);
    }
  } finally {
    rl.close();
  }
  return answers;
}

async function audit(db, userId, action, metadata) {
  await db.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (NULL, ?, 'USER', ?, ?)", [
    action,
    userId === null ? null : String(userId),
    JSON.stringify({ source: "console", osUser: os.userInfo().username, host: os.hostname(), ...metadata }),
  ]);
}

async function findAccount(db) {
  const [rows] = await db.query(
    `SELECT id, email, whatsapp_number, active, password_hash IS NOT NULL AS has_password,
            GREATEST(COALESCE(TIMESTAMPDIFF(MINUTE, CURRENT_TIMESTAMP, break_glass_until), 0), 0) AS minutes_left
     FROM users WHERE is_break_glass = TRUE LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function main() {
  const command = process.argv[2];
  const db = await connect();
  try {
    const account = await findAccount(db);

    if (command === "status") {
      if (!account) return console.log("No break-glass account yet. Run: create --email … --whatsapp …");
      const number = account.whatsapp_number ? `…${String(account.whatsapp_number).slice(-4)}` : "none";
      console.log(`Break-glass account #${account.id}: ${account.active ? "active" : "INACTIVE"}, password ${account.has_password ? "set" : "NOT set"}, WhatsApp ${number}`);
      console.log(Number(account.minutes_left) > 0 ? `ENABLED for ${account.minutes_left} more minute(s).` : "Disabled (sign-in refused).");
      return;
    }

    if (command === "create") {
      if (account) throw new Error("A break-glass account already exists.");
      const email = arg("email");
      const whatsapp = (arg("whatsapp") ?? "").replace(/\D/g, "");
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Give --email <address> (must differ from the daily login).");
      if (!/^[1-9]\d{9,14}$/.test(whatsapp)) throw new Error("Give --whatsapp <number with country code>; sign-in needs the WhatsApp code.");
      const [result] = await db.query(
        "INSERT INTO users (login_id, name, email, whatsapp_number, sign_in_method, active, is_break_glass) VALUES (?, 'Break-glass admin', ?, ?, 'PASSWORD', TRUE, TRUE)",
        [LOGIN_ID, email, whatsapp],
      );
      await db.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code IN ('USER', 'IT_ADMIN', 'SUPER_ADMIN')", [result.insertId]);
      await audit(db, result.insertId, "BREAK_GLASS_CREATED", {});
      console.log(`Created break-glass account #${result.insertId} (User ID: ${LOGIN_ID}). Now run set-password. It stays disabled until you run enable.`);
      return;
    }

    if (!account) throw new Error("No break-glass account. Run create first.");

    if (command === "set-password") {
      const [password, again] = await askHidden(["New break-glass password: ", "Type it again: "]);
      if (password !== again) throw new Error("The passwords don't match.");
      if (password.length < MIN_PASSWORD_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters with letters and numbers.`);
      }
      await db.query("UPDATE users SET password_hash = ?, password_set_at = CURRENT_TIMESTAMP, failed_login_count = 0, locked_until = NULL WHERE id = ?", [hashPassword(password), account.id]);
      await db.query("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'BREAK_GLASS_PASSWORD_SET' WHERE user_id = ? AND revoked_at IS NULL", [account.id]);
      await audit(db, account.id, "BREAK_GLASS_PASSWORD_SET", {});
      console.log("Password set. Seal it offline, separate from the daily login (D-042).");
      return;
    }

    if (command === "enable") {
      const minutes = Number(arg("minutes"));
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) throw new Error(`Give --minutes between 1 and ${MAX_MINUTES}.`);
      if (!account.has_password) throw new Error("Set the password first.");
      await db.query("UPDATE users SET break_glass_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), active = TRUE WHERE id = ?", [minutes, account.id]);
      await audit(db, account.id, "BREAK_GLASS_ENABLED", { minutes });
      console.log(`Enabled for ${minutes} minute(s). Every sign-in alerts the Super Admins. Run disable when done.`);
      return;
    }

    if (command === "disable") {
      await db.query("UPDATE users SET break_glass_until = NULL WHERE id = ?", [account.id]);
      const [ended] = await db.query("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'BREAK_GLASS_DISABLED' WHERE user_id = ? AND revoked_at IS NULL", [account.id]);
      await audit(db, account.id, "BREAK_GLASS_DISABLED", { sessionsEnded: ended.affectedRows });
      console.log(`Disabled. Ended ${ended.affectedRows} session(s).`);
      return;
    }

    throw new Error("Commands: status | create | set-password | enable --minutes N | disable");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`break-glass: ${error.message}`);
  process.exit(1);
});
