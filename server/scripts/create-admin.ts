import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

async function main(): Promise<void> {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    process.exitCode = 1;
    return;
  }
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      await pool.query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
      console.log(`Promoted existing user ${email} to admin.`);
      return;
    }
    const passwordHash = await hashPassword(password);
    await pool.query('INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, true)', [
      email,
      passwordHash,
    ]);
    console.log(`Created admin user ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
