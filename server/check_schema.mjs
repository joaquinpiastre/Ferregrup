import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

const { rows: cols } = await pool.query(`
  select column_name from information_schema.columns
  where table_name = 'catalog_products' and column_name in ('stock','cost_price','iva_rate')
`);
const { rows: tables } = await pool.query(`
  select table_name from information_schema.tables
  where table_name in ('sale_items','quotes','quote_items')
`);
console.log('catalog_products new columns:', cols.map((r) => r.column_name));
console.log('new tables:', tables.map((r) => r.table_name));
await pool.end();
