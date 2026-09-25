// Seller authentication: short-lived access token read from the
// Authorization header, long-lived refresh token stored httpOnly so
// client-side JS never touches it (and therefore can't leak it to XSS).
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import { User } from '../models/User.js';

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.jwt.accessSecret, { expiresIn: env.jwt.accessTtl });
}

export function signRefreshToken(userId) {
  return jwt.sign({ sub: userId }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl });
}

export function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Missing access token');

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    req.sellerId = payload.sub;
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
}

// Internal admin surface (dispute resolution) must never be reachable
// by an arbitrary authenticated seller — that would let any seller
// resolve any *other* seller's dispute. Must run after requireAuth.
// Fails closed: an empty ADMIN_EMAILS list denies everyone rather than
// silently admitting everyone, which is what happened before this
// check existed even though the route comments claimed it did.
export async function requireAdmin(req, _res, next) {
  const user = await User.findById(req.sellerId);
  if (!user || !env.adminEmails.includes(user.email.toLowerCase())) {
    throw new AppError(403, 'Admin access only');
  }
  next();
}
