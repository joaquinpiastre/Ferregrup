import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { streetOrdersRouter } from './routes/streetOrders.js';
import { clientsRouter } from './routes/clients.js';
import { catalogRouter } from './routes/catalog.js';
import { routeStopsRouter } from './routes/routeStops.js';
import { shiftsRouter } from './routes/shifts.js';
import { paymentsRouter } from './routes/payments.js';
import { teamRouter } from './routes/team.js';
import { gpsRouter } from './routes/gps.js';
import { trackersRouter } from './routes/trackers.js';
import { listsRouter } from './routes/lists.js';
import { startGt06Server } from './gpsTracker/gt06.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(authRouter);
app.use(streetOrdersRouter);
app.use(clientsRouter);
app.use(catalogRouter);
app.use(routeStopsRouter);
app.use(shiftsRouter);
app.use(paymentsRouter);
app.use(teamRouter);
app.use(gpsRouter);
app.use(trackersRouter);
app.use(listsRouter);

app.listen(config.port, () => {
  console.log(`Ferregrup server escuchando en :${config.port}`);
});

if (config.gt06Port && config.gt06Port !== config.port) {
  startGt06Server(config.gt06Port);
} else if (config.gt06Port) {
  console.error(`GT06_PORT (${config.gt06Port}) coincide con el puerto de la API — no se inicia el servidor de trackers para evitar el conflicto.`);
}
