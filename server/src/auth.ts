import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export type StaffRole = 'superadmin' | 'admin' | 'repartidor';

export interface AuthClaims {
  sub: string;
  name: string;
  role: StaffRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthClaims;
  }
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: '30d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta token Bearer.' });
    return;
  }
  try {
    req.user = jwt.verify(auth.slice(7), config.jwtSecret) as AuthClaims;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }
    next();
  };
}
