import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { pool } from './db/client.js';
import { authRouter } from './routes/auth.js';
import { streetOrdersRouter } from './routes/streetOrders.js';
import { clientsRouter } from './routes/clients.js';
import { catalogRouter } from './routes/catalog.js';
import { catalogImportRouter } from './routes/catalogImport.js';
import { routeStopsRouter } from './routes/routeStops.js';
import { shiftsRouter } from './routes/shifts.js';
import { paymentsRouter } from './routes/payments.js';
import { teamRouter } from './routes/team.js';
import { gpsRouter } from './routes/gps.js';
import { trackersRouter } from './routes/trackers.js';
import { listsRouter } from './routes/lists.js';
import { salesRouter } from './routes/sales.js';
import { quotesRouter } from './routes/quotes.js';
import { statsRouter } from './routes/stats.js';
import { goalsRouter } from './routes/goals.js';
import { overdueRouter } from './routes/overdue.js';
import { suppliersRouter } from './routes/suppliers.js';
import { logsRouter } from './routes/logs.js';
import { vanRouter } from './routes/van.js';
import { startGt06Server } from './gpsTracker/gt06.js';

// Las rutas son async sin try/catch; en Express 4 un error ahí es una promesa
// rechazada sin capturar, y Node por default mata todo el proceso — así se cayó
// el servidor para todos los usuarios por un solo query roto (columna faltante).
// Loguear y seguir vivo evita que un error de un pedido tumbe el resto.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (el proceso sigue corriendo):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (el proceso sigue corriendo):', err);
});

const app = express();
app.use(cors());
// El límite por defecto (100kb) queda corto para confirmar catálogos grandes
// importados desde Excel (miles de filas).
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(authRouter);
app.use(streetOrdersRouter);
app.use(clientsRouter);
app.use(catalogRouter);
app.use(catalogImportRouter);
app.use(routeStopsRouter);
app.use(shiftsRouter);
app.use(paymentsRouter);
app.use(teamRouter);
app.use(gpsRouter);
app.use(trackersRouter);
app.use(listsRouter);
app.use(salesRouter);
app.use(quotesRouter);
app.use(statsRouter);
app.use(goalsRouter);
app.use(overdueRouter);
app.use(suppliersRouter);
app.use(logsRouter);
app.use(vanRouter);

// schema.sql es idempotente (create ... if not exists): aplicarlo en cada arranque crea las tablas
// nuevas en producción sin un paso manual. Resuelve igual desde src/ (tsx) y desde dist/ (compilado).
// Si falla, solo se loguea: el resto de la API tiene que seguir levantando.
async function applySchema(): Promise<void> {
  try {
    const schemaPath = fileURLToPath(new URL('../src/db/schema.sql', import.meta.url));
    await pool.query(readFileSync(schemaPath, 'utf8'));
    console.log('Esquema de base de datos al día.');
  } catch (err) {
    console.error('No se pudo aplicar el esquema de base de datos:', err);
  }
}

applySchema().finally(() => {
  app.listen(config.port, () => {
    console.log(`Ferregrup server escuchando en :${config.port}`);
  });
});

if (config.gt06Port && config.gt06Port !== config.port) {
  startGt06Server(config.gt06Port);
} else if (config.gt06Port) {
  console.error(`GT06_PORT (${config.gt06Port}) coincide con el puerto de la API — no se inicia el servidor de trackers para evitar el conflicto.`);
}
