require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    const r = await pool.query("select id, name, role, active from staff order by role, name");
    console.log(JSON.stringify(r.rows, null, 2));
    const tables = ["clients","payments","street_orders","route_stops"];
    for (const t of tables) {
      try { const c = await pool.query("select count(*) from " + t); console.log(t + ": " + c.rows[0].count); }
      catch (e) { console.log(t + ": ERR " + e.message); }
    }
  } catch (e) {
    console.error("ERROR", e.message);
  } finally {
    await pool.end();
  }
})();
