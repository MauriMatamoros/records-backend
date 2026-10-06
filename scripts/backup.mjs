// Consistent online backup of the SQLite database (safe while the API runs).
// Usage: node scripts/backup.mjs [destination.db]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// better-sqlite3 is a dependency of the Prisma adapter, not of the app itself.
const fromAdapter = createRequire(require.resolve('@prisma/adapter-better-sqlite3'));
const Database = fromAdapter('better-sqlite3');

const source = (process.env.DATABASE_URL ?? '').replace(/^file:/, '');
if (!source) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = process.argv[2] ?? source.replace(/\.db$/, '') + `-backup-${stamp}.db`;

const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(destination);
db.close();
console.log(destination);
