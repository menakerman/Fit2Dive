import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '../../../shared/types';

// The JWT signing key must be a real secret in production. Without it, tokens
// for any role could be forged, so refuse to start rather than fall back to a
// public default. A dev-only fallback keeps local development frictionless.
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.JWT_SECRET) {
  console.error('[auth] FATAL: JWT_SECRET is not set in production. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'fit2dive-dev-only-secret-not-for-production';

export interface AuthPayload {
  userId: number;
  role: Role;
  teamId: number | null;
  diverId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload, expiresIn: string = '24h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'אימות נדרש' });
    return;
  }
  try {
    const token = header.slice(7);
    req.auth = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקף' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'אין הרשאה' });
      return;
    }
    next();
  };
}
