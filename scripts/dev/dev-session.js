// LOCAL DEVELOPMENT ONLY. Creates a session for an existing user and prints
// the value of the ars_session cookie, so the admin screens can be checked
// in a local browser before Google sign-in (Firebase Admin values) and the
// WhatsApp provider key are set up.
//
//   node scripts/dev/dev-session.js <login_id>
//
// It adds no new way in: anyone who can run it already holds the database
// and SESSION_SECRET, which is enough to create a session anyway. It refuses
// to run in production or against anything but a local database.
const crypto = require("node:crypto");
const { connect } = require("../database/env");

const SESSION_TTL_SECONDS = 60 * 60 * 12;

async function main() {
  const loginId = process.argv[2];
  if (!loginId) throw new Error("Usage: node scripts/dev/dev-session.js <login_id>");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
  if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST ?? "")) throw new Error("Refusing: DB_HOST is not local.");
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing from .env.local");

  const db = await connect();
  try {
    const [rows] = await db.query("SELECT id, name, active FROM users WHERE login_id = ? LIMIT 1", [loginId]);
    const user = rows[0];
    if (!user) throw new Error(`No user with login_id ${loginId}`);
    if (!user.active) throw new Error("That user is inactive.");

    const sid = crypto.randomUUID();
    await db.query(
      "INSERT INTO user_sessions (id, user_id, auth_method, user_agent, expires_at) VALUES (?, ?, 'GOOGLE', 'dev-session script', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))",
      [sid, user.id, SESSION_TTL_SECONDS],
    );
    await db.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (?, 'DEV_SESSION_CREATED', 'USER', ?, ?)",
      [user.id, String(user.id), JSON.stringify({ source: "scripts/dev/dev-session.js" })],
    );

    const now = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(JSON.stringify({ sid, uid: user.id, iat: now, exp: now + SESSION_TTL_SECONDS })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(`session:${encoded}`).digest("base64url");
    process.stdout.write(`${encoded}.${signature}\n`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
