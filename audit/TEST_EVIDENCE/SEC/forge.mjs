// Builds test-only cookies with the same test secret session.mjs uses (read from that file, never printed).
import fs from "node:fs"; import crypto from "node:crypto";
const src = fs.readFileSync(process.argv[2], "utf8");
const secret = src.match(/createHmac\("sha256", "([^"]+)"\)/)[1];
const [mode, a, b] = process.argv.slice(3);
const sign = (e) => crypto.createHmac("sha256", secret).update(`session:${e}`).digest("base64url");
const now = Math.floor(Date.now()/1000);
const enc = (p) => Buffer.from(JSON.stringify(p)).toString("base64url");
if (mode === "expired") { const e = enc({ sid: a, uid: Number(b), iat: now-50000, exp: now-10 }); console.log(`ars_session=${e}.${sign(e)}`); }
if (mode === "nosession") { const e = enc({ sid: crypto.randomUUID(), uid: Number(a), iat: now, exp: now+3600 }); console.log(`ars_session=${e}.${sign(e)}`); }
if (mode === "wronguid") { const e = enc({ sid: a, uid: Number(b), iat: now, exp: now+3600 }); console.log(`ars_session=${e}.${sign(e)}`); }
