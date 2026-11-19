import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
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
import { aiRouter } from './routes/ai.js';
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

/**
 * Express 4 no pasa al manejador de errores las promesas rechazadas de las rutas async: el
 * pedido quedaba colgado sin respuesta. Esto envuelve cada handler para que el error llegue.
 */
function catchAsyncErrors(router: Router): Router {
  type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
  for (const layer of router.stack as { route?: { stack: { handle: Handler }[] } }[]) {
    for (const routeLayer of layer.route?.stack ?? []) {
      const handle = routeLayer.handle;
      if (handle.length > 3) continue;
      routeLayer.handle = (req, res, next) => {
        try {
          const result = handle(req, res, next);
          if (result instanceof Promise) result.catch(next);
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}

const app = express();
// Railway pone un proxy adelante: así req.ip es la IP real del cliente.
app.set('trust proxy', 1);
app.use(cors());
// El límite por defecto (100kb) queda corto para confirmar catálogos grandes
// importados desde Excel (miles de filas).
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
for (const router of [
  authRouter,
  streetOrdersRouter,
  clientsRouter,
  catalogRouter,
  catalogImportRouter,
  routeStopsRouter,
  shiftsRouter,
  paymentsRouter,
  teamRouter,
  gpsRouter,
  trackersRouter,
  listsRouter,
  salesRouter,
  quotesRouter,
  statsRouter,
  goalsRouter,
  overdueRouter,
  suppliersRouter,
  logsRouter,
  vanRouter,
  aiRouter,
]) {
  app.use(catchAsyncErrors(router));
}

// Último recurso: cualquier error responde (en JSON) en vez de dejar el pedido colgado.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express reconoce el manejador de errores por sus 4 parámetros
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    if (!res.headersSent) res.status(status).json({ error: 'Pedido inválido.' });
    return;
  }
  console.error(`Error en ${req.method} ${req.path}:`, err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(500).json({ error: 'Error interno del servidor. Probá de nuevo en un momento.' });
});

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
