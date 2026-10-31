// D-246 (audit OPS-09): backup files are checked and, when a key is set,
// encrypted. Shared by the app (server/ops/backup.ts writes), restore.js and
// verify-backup.js (read).
//   - Every backup gets "<file>.sha256" (the hash of the file as stored).
//     Reading refuses a file whose hash doesn't match.
//   - With BACKUP_ENCRYPTION_KEY (32 bytes, base64; separate from
//     ENCRYPTION_KEY) the file is "<name>.sql.gz.enc": "ARSBK1", a 12-byte IV,
//     the AES-256-GCM ciphertext of the gzip, then the 16-byte tag.
const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");

const MAGIC = Buffer.from("ARSBK1");

function backupKey(value = process.env.BACKUP_ENCRYPTION_KEY) {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function encrypt(gzip, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzip), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

function decrypt(stored, key) {
  if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("This isn't an encrypted ARS backup.");
  if (!key) throw new Error("This backup is encrypted: set BACKUP_ENCRYPTION_KEY to the key it was made with.");
  const iv = stored.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = stored.subarray(stored.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(stored.subarray(MAGIC.length + 12, stored.length - 16)), decipher.final()]);
  } catch {
    throw new Error("The backup can't be decrypted: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.");
  }
}

// The stored file → the SQL text. The hash is checked first when it exists.
function readBackup(file, key = backupKey()) {
  const stored = fs.readFileSync(file);
  const hashFile = `${file}.sha256`;
  if (fs.existsSync(hashFile)) {
    const expected = fs.readFileSync(hashFile, "utf8").trim().split(/\s+/)[0];
    if (expected !== sha256(stored)) throw new Error(`${file} doesn't match its .sha256: the file is damaged or was changed.`);
  }
  const gzip = file.endsWith(".enc") ? decrypt(stored, key) : stored;
  return (file.endsWith(".gz") || file.endsWith(".gz.enc") ? zlib.gunzipSync(gzip) : gzip).toString("utf8");
}

module.exports = { backupKey, sha256, encrypt, decrypt, readBackup, MAGIC };
