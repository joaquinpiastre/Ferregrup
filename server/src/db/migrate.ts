import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

async function main() {
  const sql = readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Esquema aplicado correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
