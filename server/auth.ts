import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { StaffRole, StaffUser, StaffUserRecord } from '../src/types/hms.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'meridian-clinical-dev-secret-change-in-production';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  department: string;
  doctorId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function sanitizeStaffUser(record: StaffUserRecord): StaffUser {
  return {
    _id: record._id,
    name: record.name,
    email: record.email,
    role: record.role,
    department: record.department,
    doctorId: record.doctorId,
    active: record.active,
    createdAt: record.createdAt,
  };
}

export function signStaffToken(user: StaffUser): string {
  const payload: AuthTokenPayload = {
    userId: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    doctorId: user.doctorId,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

export function requireRole(...roles: StaffRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. This action requires one of the following roles: ${roles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}
