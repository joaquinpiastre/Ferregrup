import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../auth.js';
import { pool } from '../db/client.js';

// Archivos que un administrador le adjunta al asistente de IA (listas de precios de
// proveedores). Se guardan en la base (el disco del servidor no sobrevive a un despliegue) y
// se borran solos a los 30 días.

export const filesRouter = Router();

const MAX_BYTES = 20 * 1024 * 1024;
const KEEP_MS = 30 * 86_400_000;
const ALLOWED = /\.(xlsx|xls|csv)$/i;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

filesRouter.post(
  '/files',
  requireAuth,
  requireRole('admin'),
  // Los archivos los sube una persona: el token interno de la IA no puede subir nada.
  (req, res, next) => {
    if (req.user?.via === 'ia') {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }
    next();
  },
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        res.status(400).json({ error: tooBig ? 'El archivo pesa más de 20 MB.' : 'No se pudo recibir el archivo.' });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Elegí un archivo.' });
      return;
    }
    // multer entrega el nombre como latin1: se pasa a UTF-8 para no romper los acentos.
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 200);
    if (!ALLOWED.test(name)) {
      res.status(400).json({ error: 'Por ahora se pueden adjuntar planillas de Excel (.xlsx o .xls) o archivos .csv.' });
      return;
    }
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    await pool.query(`delete from uploaded_files where created_at_ms < $1`, [now - KEEP_MS]);
    await pool.query(
      `insert into uploaded_files (id, staff_id, file_name, mime, size, data, created_at_ms) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.user!.sub, name, file.mimetype || null, file.size, file.buffer, now]
    );
    res.json({ id, name, size: file.size });
  }
);

/** Datos de un archivo subido por ese usuario (o null si no existe o es de otro). */
export async function findUploadedFile(id: string, staffId: string): Promise<{ id: string; name: string; data: Buffer } | null> {
  const { rows } = await pool.query(`select id, file_name, data from uploaded_files where id = $1 and staff_id = $2`, [id, staffId]);
  const r = rows[0];
  return r ? { id: r.id, name: r.file_name, data: r.data as Buffer } : null;
}

/** Nombres de varios archivos del usuario (para mostrar los adjuntos de un mensaje). */
export async function uploadedFileNames(ids: string[], staffId: string): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(`select id, file_name from uploaded_files where id = any($1::text[]) and staff_id = $2`, [ids, staffId]);
  const byId = new Map(rows.map((r) => [r.id as string, r.file_name as string]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
}
